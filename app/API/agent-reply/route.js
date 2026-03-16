import { createClient } from "@supabase/supabase-js"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

const ESCALATION_KEYWORDS = [
  "agente", "humano", "persona", "operador", "asesor",
  "hablar con alguien", "quiero hablar", "necesito ayuda humana",
]

function detectEscalation(text) {
  const lower = text.toLowerCase()
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Llamada a OpenAI ─────────────────────────────────────────────────────────

async function callOpenAI(model, systemPrompt, messages, apiKey) {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) throw new Error("Falta OPENAI_API_KEY")

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || "Error OpenAI")
  return data.choices[0].message.content.trim()
}

// ─── Llamada a Anthropic ──────────────────────────────────────────────────────

async function callAnthropic(model, systemPrompt, messages, apiKey) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, system: systemPrompt, messages, max_tokens: 1024 }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || "Error Anthropic")
  return data.content[0].text.trim()
}

// ─── POST /API/agent-reply ────────────────────────────────────────────────────

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return Response.json({ error: "Body inválido" }, { status: 400 }) }

  const { conversation_id, message_text, organization_id } = body

  if (!conversation_id || !message_text) {
    return Response.json({ error: "Faltan conversation_id o message_text" }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 1. Detectar escalación por palabras clave
  if (detectEscalation(message_text)) {
    return Response.json({ action: "escalate", reason: "keyword" })
  }

  // 2. Cargar conversación
  let convQuery = supabase
    .from("conversations")
    .select("id, mode, contact_id, wa_contact_id, pipeline_stage, organization_id")
    .eq("id", conversation_id)
  if (organization_id) convQuery = convQuery.eq("organization_id", organization_id)

  const { data: conv } = await convQuery.single()

  if (!conv || conv.mode !== "bot") {
    return Response.json({ action: "skip", reason: "not_bot_mode" })
  }

  const orgId = organization_id || conv.organization_id

  // 3. Leer credenciales de la organización
  let orgCredentials = {}
  if (orgId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("openai_api_key, anthropic_api_key")
      .eq("id", orgId)
      .maybeSingle()
    orgCredentials = org ?? {}
  }

  // 4. Buscar agente asignado a la etapa
  let agent = null
  if (conv.pipeline_stage) {
    let stageQuery = supabase
      .from("pipeline_stages")
      .select("agent_id")
      .eq("name", conv.pipeline_stage)
    if (orgId) stageQuery = stageQuery.eq("organization_id", orgId)

    const { data: stageRow } = await stageQuery.maybeSingle()
    if (stageRow?.agent_id) {
      const agentQuery = supabase
        .from("agents")
        .select("*")
        .eq("id", stageRow.agent_id)
        .eq("active", true)
      const { data: stageAgent } = await agentQuery.maybeSingle()
      agent = stageAgent ?? null
    }
  }

  // Fallback: primer agente activo de la organización
  if (!agent) {
    let fallbackQuery = supabase
      .from("agents")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
    if (orgId) fallbackQuery = fallbackQuery.eq("organization_id", orgId)

    const { data: fallbackAgent } = await fallbackQuery.maybeSingle()
    agent = fallbackAgent ?? null
  }

  if (!agent) {
    return Response.json({ action: "skip", reason: "no_active_agent" })
  }

  // 5. Cargar historial (últimos 20 mensajes)
  const histQuery = supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversation_id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: history } = await histQuery

  const messages = (history ?? []).reverse().map((m) => ({
    role: m.sender_type === "contact" ? "user" : "assistant",
    content: m.content ?? "",
  }))

  if (!messages.length || messages[messages.length - 1].content !== message_text) {
    messages.push({ role: "user", content: message_text })
  }

  // 6. System prompt
  const systemPrompt = [
    agent.instructions?.trim() || "Eres un asistente de atención al cliente. Responde de forma amable y concisa en español.",
    "",
    "REGLAS IMPORTANTES:",
    "- Responde SIEMPRE en español.",
    "- Si el usuario pide explícitamente hablar con un humano, agente, persona u operador, responde exactamente con: [ESCALAR_A_HUMANO]",
    "- No inventes información que no tengas. Si no sabes algo, indícalo claramente.",
    "- Sé conciso. Máximo 3 párrafos por respuesta.",
  ].join("\n")

  // 7. Llamar al LLM con credenciales de la organización (o fallback env)
  let replyText
  try {
    if (agent.llm_provider === "anthropic") {
      replyText = await callAnthropic(agent.llm_model, systemPrompt, messages, orgCredentials.anthropic_api_key)
    } else {
      replyText = await callOpenAI(agent.llm_model, systemPrompt, messages, orgCredentials.openai_api_key)
    }
  } catch (err) {
    console.error("[agent-reply] Error LLM:", err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }

  if (replyText.includes("[ESCALAR_A_HUMANO]")) {
    return Response.json({ action: "escalate", reason: "llm_decision" })
  }

  return Response.json({ action: "reply", text: replyText, agent_id: agent.id, agent_name: agent.name })
}

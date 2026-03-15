import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const ESCALATION_KEYWORDS = [
  "agente", "humano", "persona", "operador", "asesor",
  "hablar con alguien", "quiero hablar", "necesito ayuda humana",
]

function detectEscalation(text) {
  const lower = text.toLowerCase()
  return ESCALATION_KEYWORDS.some((kw) => lower.includes(kw))
}

// ─── Llamada a OpenAI ─────────────────────────────────────────────────────────

async function callOpenAI(model, systemPrompt, messages) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("Falta OPENAI_API_KEY")

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || "Error OpenAI")
  return data.choices[0].message.content.trim()
}

// ─── Llamada a Anthropic ──────────────────────────────────────────────────────

async function callAnthropic(model, systemPrompt, messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta ANTHROPIC_API_KEY")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages,
      max_tokens: 1024,
    }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message || "Error Anthropic")
  return data.content[0].text.trim()
}

// ─── POST /API/agent-reply ────────────────────────────────────────────────────

export async function POST(req) {
  let body
  try { body = await req.json() } catch { return Response.json({ error: "Body inválido" }, { status: 400 }) }

  const { conversation_id, message_text } = body

  if (!conversation_id || !message_text) {
    return Response.json({ error: "Faltan conversation_id o message_text" }, { status: 400 })
  }

  // 1. Detectar escalación por palabras clave
  if (detectEscalation(message_text)) {
    return Response.json({ action: "escalate", reason: "keyword" })
  }

  // 2. Cargar conversación para saber qué agente está asignado (si hay)
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, mode, contact_id, wa_contact_id")
    .eq("id", conversation_id)
    .single()

  if (!conv || conv.mode !== "bot") {
    return Response.json({ action: "skip", reason: "not_bot_mode" })
  }

  // 3. Cargar agente activo (el primero activo, o se puede asociar por conversación más adelante)
  const { data: agent } = await supabase
    .from("agents")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!agent) {
    return Response.json({ action: "skip", reason: "no_active_agent" })
  }

  // 4. Cargar historial de mensajes (últimos 20)
  const { data: history } = await supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversation_id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(20)

  // Convertir al formato messages del LLM (más antiguo primero)
  const messages = (history ?? []).reverse().map((m) => ({
    role: m.sender_type === "contact" ? "user" : "assistant",
    content: m.content ?? "",
  }))

  // Asegurar que el último mensaje sea el actual
  if (!messages.length || messages[messages.length - 1].content !== message_text) {
    messages.push({ role: "user", content: message_text })
  }

  // 5. Construir system prompt
  const systemPrompt = [
    agent.instructions?.trim() || "Eres un asistente de atención al cliente. Responde de forma amable y concisa en español.",
    "",
    "REGLAS IMPORTANTES:",
    "- Responde SIEMPRE en español.",
    "- Si el usuario pide explícitamente hablar con un humano, agente, persona u operador, responde exactamente con: [ESCALAR_A_HUMANO]",
    "- No inventes información que no tengas. Si no sabes algo, indícalo claramente.",
    "- Sé conciso. Máximo 3 párrafos por respuesta.",
  ].join("\n")

  // 6. Llamar al LLM
  let replyText
  try {
    if (agent.llm_provider === "anthropic") {
      replyText = await callAnthropic(agent.llm_model, systemPrompt, messages)
    } else {
      replyText = await callOpenAI(agent.llm_model, systemPrompt, messages)
    }
  } catch (err) {
    console.error("[agent-reply] Error LLM:", err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }

  // 7. Detectar si el LLM decidió escalar
  if (replyText.includes("[ESCALAR_A_HUMANO]")) {
    return Response.json({ action: "escalate", reason: "llm_decision" })
  }

  return Response.json({ action: "reply", text: replyText, agent_id: agent.id, agent_name: agent.name })
}

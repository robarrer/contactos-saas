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

// ─── Ejecutar una tool (llamada HTTP a API externa) ───────────────────────────

async function executeTool(tool, params) {
  try {
    // Reemplazar {{variable}} en la URL con valores de params
    let url = tool.url.replace(/\{\{(\w+)\}\}/g, (_, key) =>
      encodeURIComponent(params[key] ?? "")
    )

    // Agregar query params
    const queryParams = (tool.parameters || []).filter((p) => p.in === "query")
    if (queryParams.length) {
      const qs = new URLSearchParams()
      queryParams.forEach((p) => {
        if (params[p.name] !== undefined && params[p.name] !== null)
          qs.set(p.name, String(params[p.name]))
      })
      const qsStr = qs.toString()
      if (qsStr) url += (url.includes("?") ? "&" : "?") + qsStr
    }

    const headers = { ...(tool.headers || {}) }
    let body

    if (["POST", "PUT", "PATCH"].includes(tool.http_method)) {
      const bodyObj = {}
      ;(tool.parameters || [])
        .filter((p) => p.in === "body")
        .forEach((p) => {
          if (params[p.name] !== undefined) bodyObj[p.name] = params[p.name]
        })
      body = JSON.stringify(bodyObj)
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json"
    }

    console.log(`[agent-reply] executeTool ${tool.http_method} ${url}`)
    const res = await fetch(url, { method: tool.http_method, headers, body })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error(`[agent-reply] Tool "${tool.name}" HTTP ${res.status}:`, errText.slice(0, 200))
      return { error: `HTTP ${res.status}`, message: errText.slice(0, 500) }
    }

    const ct = res.headers.get("content-type") || ""
    const result = ct.includes("application/json") ? await res.json() : { text: await res.text() }
    console.log(`[agent-reply] Tool "${tool.name}" result:`, JSON.stringify(result).slice(0, 300))
    return result
  } catch (err) {
    console.error(`[agent-reply] Error ejecutando tool "${tool.name}":`, err.message)
    return { error: err.message }
  }
}

// ─── Construir schema de tools para el LLM ───────────────────────────────────

function buildOpenAITools(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          (t.parameters || []).map((p) => [
            p.name,
            { type: p.type || "string", description: p.description },
          ])
        ),
        required: (t.parameters || []).filter((p) => p.required).map((p) => p.name),
      },
    },
  }))
}

function buildAnthropicTools(tools) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object",
      properties: Object.fromEntries(
        (t.parameters || []).map((p) => [
          p.name,
          { type: p.type || "string", description: p.description },
        ])
      ),
      required: (t.parameters || []).filter((p) => p.required).map((p) => p.name),
    },
  }))
}

// ─── Llamada a OpenAI (con soporte de function calling) ──────────────────────

async function callOpenAI(model, systemPrompt, messages, apiKey, tools = []) {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) throw new Error("Falta OPENAI_API_KEY")

  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.7,
  }

  if (tools.length) {
    body.tools = buildOpenAITools(tools)
    body.tool_choice = "auto"
  }

  const res1 = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  const data1 = await res1.json()
  if (!res1.ok) throw new Error(data1?.error?.message || "Error OpenAI")

  const msg1 = data1.choices[0].message

  // LLM quiere llamar a una tool
  if (msg1.tool_calls?.length) {
    const toolCall = msg1.tool_calls[0]
    const toolDef  = tools.find((t) => t.name === toolCall.function.name)

    if (toolDef) {
      let toolParams = {}
      try { toolParams = JSON.parse(toolCall.function.arguments) } catch {}

      console.log(`[agent-reply] OpenAI tool_call: ${toolCall.function.name}`, JSON.stringify(toolParams))
      const toolResult = await executeTool(toolDef, toolParams)

      // Segunda llamada con el resultado de la tool
      const res2 = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            msg1,
            { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) },
          ],
          max_tokens: 1024,
          temperature: 0.7,
        }),
      })

      const data2 = await res2.json()
      if (!res2.ok) throw new Error(data2?.error?.message || "Error OpenAI (respuesta tool)")
      return data2.choices[0].message.content.trim()
    }
  }

  return msg1.content?.trim() || ""
}

// ─── Llamada a Anthropic (con soporte de tool use) ───────────────────────────

async function callAnthropic(model, systemPrompt, messages, apiKey, tools = []) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY")

  const body = {
    model,
    system: systemPrompt,
    messages,
    max_tokens: 1024,
  }

  if (tools.length) {
    body.tools = buildAnthropicTools(tools)
  }

  const res1 = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const data1 = await res1.json()
  if (!res1.ok) throw new Error(data1?.error?.message || "Error Anthropic")

  // LLM quiere llamar a una tool
  if (data1.stop_reason === "tool_use") {
    const toolUse = data1.content.find((c) => c.type === "tool_use")
    if (toolUse) {
      const toolDef = tools.find((t) => t.name === toolUse.name)
      if (toolDef) {
        console.log(`[agent-reply] Anthropic tool_use: ${toolUse.name}`, JSON.stringify(toolUse.input))
        const toolResult = await executeTool(toolDef, toolUse.input || {})

        // Segunda llamada con el resultado de la tool
        const res2 = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            system: systemPrompt,
            messages: [
              ...messages,
              { role: "assistant", content: data1.content },
              {
                role: "user",
                content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }],
              },
            ],
            max_tokens: 1024,
          }),
        })

        const data2 = await res2.json()
        if (!res2.ok) throw new Error(data2?.error?.message || "Error Anthropic (respuesta tool)")
        return data2.content.find((c) => c.type === "text")?.text?.trim() || ""
      }
    }
  }

  return data1.content.find((c) => c.type === "text")?.text?.trim() || ""
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

  const { data: conv, error: convError } = await convQuery.single()

  if (convError) {
    console.error(`[agent-reply] Error cargando conv=${conversation_id}:`, convError.message)
    return Response.json({ action: "skip", reason: "conv_error", detail: convError.message })
  }

  if (!conv) {
    console.warn(`[agent-reply] Conversación no encontrada conv=${conversation_id} org=${organization_id}`)
    return Response.json({ action: "skip", reason: "conv_not_found" })
  }

  console.log(`[agent-reply] conv=${conversation_id} mode=${conv.mode} stage=${conv.pipeline_stage} org=${conv.organization_id}`)

  if (conv.mode !== "bot") {
    console.warn(`[agent-reply] Saltando — mode=${conv.mode} (no es bot)`)
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
      const { data: stageAgent } = await supabase
        .from("agents")
        .select("*")
        .eq("id", stageRow.agent_id)
        .eq("active", true)
        .maybeSingle()
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
    console.warn(`[agent-reply] No hay agente activo para conv=${conversation_id} org=${orgId} stage=${conv.pipeline_stage}`)
    return Response.json({ action: "skip", reason: "no_active_agent" })
  }

  console.log(`[agent-reply] Usando agente="${agent.name}" provider=${agent.llm_provider} model=${agent.llm_model}`)

  // 5. Cargar herramientas del agente (integraciones API)
  const { data: agentTools } = await supabase
    .from("agent_tools")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("enabled", true)

  const tools = agentTools ?? []
  if (tools.length) {
    console.log(`[agent-reply] ${tools.length} herramienta(s): ${tools.map((t) => t.name).join(", ")}`)
  }

  // 6. Cargar historial (últimos 20 mensajes)
  const { data: history } = await supabase
    .from("messages")
    .select("direction, sender_type, content")
    .eq("conversation_id", conversation_id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(20)

  const messages = (history ?? []).reverse().map((m) => ({
    role: m.sender_type === "contact" ? "user" : "assistant",
    content: m.content ?? "",
  }))

  if (!messages.length || messages[messages.length - 1].content !== message_text) {
    messages.push({ role: "user", content: message_text })
  }

  // 7. System prompt
  const systemPrompt = [
    agent.instructions?.trim() || "Eres un asistente de atención al cliente. Responde de forma amable y concisa en español.",
    "",
    "REGLAS IMPORTANTES:",
    "- Responde SIEMPRE en español.",
    "- Si el usuario pide explícitamente hablar con un humano, agente, persona u operador, responde exactamente con: [ESCALAR_A_HUMANO]",
    "- No inventes información que no tengas. Si no sabes algo, indícalo claramente.",
    "- Sé conciso. Máximo 3 párrafos por respuesta.",
  ].join("\n")

  // 8. Llamar al LLM (con function calling si hay tools)
  let replyText
  try {
    if (agent.llm_provider === "anthropic") {
      replyText = await callAnthropic(agent.llm_model, systemPrompt, messages, orgCredentials.anthropic_api_key, tools)
    } else {
      replyText = await callOpenAI(agent.llm_model, systemPrompt, messages, orgCredentials.openai_api_key, tools)
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

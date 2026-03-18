import { createClient } from "@supabase/supabase-js"
import { getEnabledFunctions } from "@/app/lib/integrations/catalog.js"
import { execute as executeDentalink } from "@/app/lib/integrations/executors/dentalink.js"
import { execute as executeAdmintour } from "@/app/lib/integrations/executors/admintour.js"

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

// ─── Executores por plataforma ────────────────────────────────────────────────

const PLATFORM_EXECUTORS = {
  dentalink: executeDentalink,
  admintour: executeAdmintour,
}

async function executeTool(fn, params) {
  const platform = fn._platform
  const config   = fn._config ?? {}

  // Búsqueda exacta en base de conocimiento CSV
  if (platform === "csv_kb") {
    const searchVal = String(params.valor ?? "").trim().toLowerCase()
    const rows      = fn._kb_rows ?? []
    const col       = fn._search_column
    const matches   = rows.filter((r) => String(r[col] ?? "").trim().toLowerCase() === searchVal)
    if (!matches.length) {
      return { resultado: `No se encontraron registros con el valor "${params.valor}" en la columna "${col}".` }
    }
    console.log(`[agent-reply] csv_kb "${fn._kb_name}" col="${col}" val="${searchVal}" → ${matches.length} resultado(s)`)
    return { resultado: matches, total: matches.length }
  }

  const executor = PLATFORM_EXECUTORS[platform]

  if (!executor) {
    console.error(`[agent-reply] No hay executor para plataforma "${platform}"`)
    return { error: `Plataforma no soportada: ${platform}` }
  }

  try {
    console.log(`[agent-reply] executeTool platform=${platform} fn=${fn.id}`, JSON.stringify(params))
    return await executor(fn.id, params, config)
  } catch (err) {
    console.error(`[agent-reply] Error ejecutando ${platform}.${fn.id}:`, err.message)
    return { error: err.message }
  }
}

// ─── Construir schema de tools para el LLM ───────────────────────────────────

function buildLLMParams(parameters) {
  const props = {}
  const required = []
  for (const p of parameters ?? []) {
    props[p.name] = { type: p.type || "string", description: p.description }
    if (p.required) required.push(p.name)
  }
  return { properties: props, required }
}

function buildOpenAITools(tools) {
  return tools.map((t) => {
    const { properties, required } = buildLLMParams(t.parameters)
    return {
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: "object", properties, required },
      },
    }
  })
}

function buildAnthropicTools(tools) {
  return tools.map((t) => {
    const { properties, required } = buildLLMParams(t.parameters)
    return {
      name: t.name,
      description: t.description,
      input_schema: { type: "object", properties, required },
    }
  })
}

// ─── Fetch con timeout y retry para 429 ──────────────────────────────────────

const LLM_TIMEOUT_MS = 30000
const MAX_RETRIES    = 1

async function fetchLLM(url, options) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(LLM_TIMEOUT_MS) })

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10)
      console.warn(`[agent-reply] LLM 429, reintentando en ${retryAfter}s...`)
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      continue
    }

    return res
  }
}

// ─── Llamada a OpenAI (con loop de tool calls) ──────────────────────────────

const MAX_TOOL_ROUNDS = 5

async function callOpenAI(model, systemPrompt, messages, apiKey, tools = []) {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) throw new Error("Falta OPENAI_API_KEY")

  const allMessages = [{ role: "system", content: systemPrompt }, ...messages]
  const llmTools = tools.length ? buildOpenAITools(tools) : undefined

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const body = { model, messages: allMessages, max_tokens: 1024, temperature: 0.7 }
    if (llmTools) { body.tools = llmTools; body.tool_choice = "auto" }

    const res = await fetchLLM("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || `Error OpenAI (HTTP ${res.status})`)

    const msg = data.choices[0].message

    if (!msg.tool_calls?.length || round === MAX_TOOL_ROUNDS) {
      return msg.content?.trim() || ""
    }

    // Procesar todas las tool calls del turno
    allMessages.push(msg)
    for (const toolCall of msg.tool_calls) {
      const toolDef = tools.find((t) => t.name === toolCall.function.name)
      let toolParams = {}
      try { toolParams = JSON.parse(toolCall.function.arguments) } catch {}

      console.log(`[agent-reply] OpenAI tool_call[${round}]: ${toolCall.function.name}`, JSON.stringify(toolParams))

      const toolResult = toolDef
        ? await executeTool(toolDef, toolParams)
        : { error: `Función desconocida: ${toolCall.function.name}` }

      allMessages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(toolResult) })
    }
  }

  return ""
}

// ─── Llamada a Anthropic (con loop de tool calls) ───────────────────────────

async function callAnthropic(model, systemPrompt, messages, apiKey, tools = []) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY")

  const allMessages = [...messages]
  const llmTools = tools.length ? buildAnthropicTools(tools) : undefined

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const body = { model, system: systemPrompt, messages: allMessages, max_tokens: 1024 }
    if (llmTools) body.tools = llmTools

    const res = await fetchLLM("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || `Error Anthropic (HTTP ${res.status})`)

    if (data.stop_reason !== "tool_use" || round === MAX_TOOL_ROUNDS) {
      return data.content.find((c) => c.type === "text")?.text?.trim() || ""
    }

    // Procesar todas las tool uses del turno
    allMessages.push({ role: "assistant", content: data.content })
    const toolResults = []

    for (const block of data.content.filter((c) => c.type === "tool_use")) {
      const toolDef = tools.find((t) => t.name === block.name)

      console.log(`[agent-reply] Anthropic tool_use[${round}]: ${block.name}`, JSON.stringify(block.input))

      const toolResult = toolDef
        ? await executeTool(toolDef, block.input || {})
        : { error: `Función desconocida: ${block.name}` }

      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(toolResult) })
    }

    allMessages.push({ role: "user", content: toolResults })
  }

  return ""
}

// ─── POST /API/agent-reply ────────────────────────────────────────────────────

export async function POST(req) {
  const internalSecret = req.headers.get("x-internal-secret")
  if (!process.env.INTERNAL_API_SECRET || internalSecret !== process.env.INTERNAL_API_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

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
  // Nota: pipeline_stages no almacena organization_id, se busca solo por nombre.
  let agent = null
  if (conv.pipeline_stage) {
    const { data: stageRow } = await supabase
      .from("pipeline_stages")
      .select("agent_id")
      .eq("name", conv.pipeline_stage)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle()

    console.log(`[agent-reply] stage="${conv.pipeline_stage}" → agent_id=${stageRow?.agent_id ?? "ninguno"}`)

    if (stageRow?.agent_id) {
      const { data: stageAgent } = await supabase
        .from("agents")
        .select("*")
        .eq("id", stageRow.agent_id)
        .eq("active", true)
        .maybeSingle()

      agent = stageAgent ?? null
      if (!agent) {
        console.warn(`[agent-reply] Agente ${stageRow.agent_id} asignado a la etapa no existe o está inactivo.`)
      }
    } else {
      console.warn(`[agent-reply] La etapa "${conv.pipeline_stage}" no tiene agente asignado.`)
    }
  }

  // Fallback: solo si la etapa no tiene agente asignado o el agente está inactivo
  if (!agent) {
    console.warn(`[agent-reply] Usando fallback — no hay agente para la etapa "${conv.pipeline_stage}".`)
    let fallbackQuery = supabase
      .from("agents")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true })
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

  // 5. Cargar integraciones activas y sus funciones habilitadas (desde catálogo)
  const { data: integrations } = await supabase
    .from("agent_integrations")
    .select("id, platform, config, enabled_functions")
    .eq("agent_id", agent.id)
    .eq("enabled", true)

  let tools = []
  for (const integration of integrations ?? []) {
    const fns = getEnabledFunctions(integration.platform, integration.enabled_functions ?? [])
    for (const fn of fns) {
      tools.push({
        ...fn,
        _platform: integration.platform,
        _config:   integration.config ?? {},
      })
    }
  }

  // 5b. Cargar bases de conocimiento CSV del agente
  const { data: csvKbs, error: csvError } = await supabase
    .from("agent_csv_knowledge")
    .select("id, name, search_column, rows")
    .eq("agent_id", agent.id)

  if (csvError) {
    console.error(`[agent-reply] Error cargando CSV KBs:`, csvError.message)
  }

  const csvKbTools = []
  for (const kb of csvKbs ?? []) {
    const safeName = kb.name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || `kb_${kb.id.slice(0, 8)}`

    const toolDef = {
      id:          `csv_${safeName}`,
      name:        `buscar_${safeName}`,
      description: `OBLIGATORIO: Usa esta función para buscar en la base de datos "${kb.name}" cuando el usuario mencione cualquier código, número, referencia o identificador. Búsqueda exacta por la columna "${kb.search_column}". SIEMPRE llama a esta función antes de responder sobre un código o registro específico.`,
      parameters:  [
        {
          name:        "valor",
          type:        "string",
          description: `Valor exacto a buscar en la columna "${kb.search_column}" (por ejemplo: un código numérico, un ID o una referencia)`,
          required:    true,
        },
      ],
      _platform:      "csv_kb",
      _config:        {},
      _kb_rows:       kb.rows ?? [],
      _search_column: kb.search_column,
      _kb_name:       kb.name,
    }
    tools.push(toolDef)
    csvKbTools.push(toolDef)
    console.log(`[agent-reply] CSV KB cargado: "${kb.name}" columna="${kb.search_column}" filas=${Array.isArray(kb.rows) ? kb.rows.length : "?"}`)
  }

  if (!csvKbs || csvKbs.length === 0) {
    console.warn(`[agent-reply] No se encontraron CSV KBs para agent_id=${agent.id}`)
  }

  if (tools.length) {
    console.log(`[agent-reply] ${tools.length} función(es): ${tools.map((t) => t.name).join(", ")}`)
  }

  // 6. Cargar historial (últimos 20 mensajes, solo del contacto para evitar
  //    que respuestas de otros agentes contaminen el contexto)
  const { data: history } = await supabase
    .from("messages")
    .select("direction, sender_type, sender_name, content")
    .eq("conversation_id", conversation_id)
    .eq("is_internal", false)
    .order("created_at", { ascending: false })
    .limit(20)

  const rawMessages = (history ?? []).reverse().map((m) => {
    if (m.sender_type === "contact") {
      return { role: "user", content: m.content ?? "" }
    }
    const isCurrentAgent = m.sender_name === agent.name
    if (isCurrentAgent) {
      return { role: "assistant", content: m.content ?? "" }
    }
    return {
      role: "assistant",
      content: `[Mensaje de otro asistente — ignora su contexto temático]: ${m.content ?? ""}`,
    }
  })

  if (!rawMessages.length || rawMessages[rawMessages.length - 1].content !== message_text) {
    rawMessages.push({ role: "user", content: message_text })
  }

  // Limitar historial a ~3000 tokens para no exceder context window
  const MAX_HISTORY_CHARS = 12000
  let charCount = 0
  const messages = []
  for (let i = rawMessages.length - 1; i >= 0; i--) {
    const len = rawMessages[i].content.length
    if (charCount + len > MAX_HISTORY_CHARS && messages.length > 0) break
    messages.unshift(rawMessages[i])
    charCount += len
  }

  // 7. System prompt
  const kbSection = csvKbTools.length > 0
    ? [
        "",
        "BASES DE CONOCIMIENTO DISPONIBLES:",
        ...csvKbTools.map((kb) => `- "${kb._kb_name}": búsqueda exacta por columna "${kb._search_column}". Usa la función ${kb.name}() SIEMPRE que el usuario mencione un código, número o referencia que pueda estar en esta base de datos.`),
        "REGLA CRÍTICA: Antes de responder que no tienes información sobre un código o registro, DEBES llamar a la función de búsqueda correspondiente. Nunca digas 'no tengo información' sin haber buscado primero.",
      ].join("\n")
    : ""

  const systemPrompt = [
    `Eres "${agent.name}". ${agent.instructions?.trim() || "Eres un asistente de atención al cliente. Responde de forma amable y concisa en español."}`,
    kbSection,
    "",
    "REGLAS IMPORTANTES:",
    "- Responde SIEMPRE en español.",
    `- Tu identidad es ÚNICAMENTE "${agent.name}". No asumas ni uses conocimiento, contexto ni tono de ningún otro agente que aparezca en el historial.`,
    "- Si en el historial hay mensajes marcados como '[Respuesta anterior de otro asistente]', ignora su contenido temático y responde solo según TUS instrucciones.",
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

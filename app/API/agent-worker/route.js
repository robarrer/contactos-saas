import { createClient } from "@supabase/supabase-js"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

/**
 * POST /API/agent-worker
 *
 * Estrategia "último gana" con polling activo:
 * 1. Registra este mensaje en message_debounce
 * 2. Hace polling cada 500ms hasta que pase el tiempo de debounce
 * 3. Si sigue siendo el último mensaje, invoca al agente
 */
export async function POST(req) {
  const internalSecret = req.headers.get("x-internal-secret")
  if (!process.env.INTERNAL_API_SECRET || internalSecret !== process.env.INTERNAL_API_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let body
  try { body = await req.json() } catch { return Response.json({ error: "bad body" }, { status: 400 }) }

  const { conversation_id, content, wa_id, message_timestamp, organization_id } = body
  if (!conversation_id || !content || !wa_id) {
    return Response.json({ error: "Faltan parámetros" }, { status: 400 })
  }

  const supabase = getServiceClient()

  // 1. Leer tiempo de debounce desde settings de la organización
  const settingsQuery = supabase
    .from("settings")
    .select("value")
    .eq("key", "message_debounce_seconds")
  if (organization_id) settingsQuery.eq("organization_id", organization_id)

  const { data: setting } = await settingsQuery.maybeSingle()
  const debounceSeconds = Math.max(0, Math.min(8, parseInt(setting?.value ?? "5", 10)))

  console.log(`[worker] START conv=${conversation_id} org=${organization_id} debounce=${debounceSeconds}s ts=${message_timestamp}`)

  // 2. Registrar este mensaje como candidato (solo si timestamp >= existente)
  const debounceQuery = supabase
    .from("message_debounce")
    .select("last_message_at")
    .eq("conversation_id", conversation_id)
  if (organization_id) debounceQuery.eq("organization_id", organization_id)

  const { data: existing } = await debounceQuery.maybeSingle()

  const existingAt = existing ? new Date(existing.last_message_at).getTime() : 0
  const thisAt     = new Date(message_timestamp).getTime()

  if (thisAt >= existingAt) {
    const upsertData = {
      conversation_id,
      last_message_at: message_timestamp,
      pending_text:    content,
    }
    if (organization_id) upsertData.organization_id = organization_id

    await supabase
      .from("message_debounce")
      .upsert(upsertData, { onConflict: "conversation_id" })
    console.log(`[worker] Registrado en debounce conv=${conversation_id}`)
  } else {
    console.log(`[worker] Ignorado (más antiguo) conv=${conversation_id}`)
    return Response.json({ action: "skipped", reason: "older_message" })
  }

  // 3. Polling hasta que pasen debounceSeconds
  if (debounceSeconds > 0) {
    const deadline = Date.now() + debounceSeconds * 1000
    const pollMs   = 500

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs))

      const pollQuery = supabase
        .from("message_debounce")
        .select("last_message_at")
        .eq("conversation_id", conversation_id)
      if (organization_id) pollQuery.eq("organization_id", organization_id)

      const { data: current } = await pollQuery.maybeSingle()

      if (!current) {
        console.log(`[worker] Fila eliminada durante espera — conv=${conversation_id}`)
        return Response.json({ action: "cancelled", reason: "row_gone" })
      }

      const latestAt = new Date(current.last_message_at).getTime()
      if (latestAt > thisAt + 500) {
        console.log(`[worker] Mensaje más reciente detectado — cediendo conv=${conversation_id}`)
        return Response.json({ action: "cancelled", reason: "newer_message" })
      }
    }
  }

  // 4. Verificación atómica: delete solo si last_message_at sigue siendo el mío
  //    Si otro worker actualizó el timestamp, el delete no matchea y retorna count=0
  const { data: deleted } = await supabase
    .from("message_debounce")
    .delete()
    .eq("conversation_id", conversation_id)
    .eq("last_message_at", message_timestamp)
    .select("conversation_id")

  if (!deleted?.length) {
    console.log(`[worker] Lock perdido — otro worker tomó el control conv=${conversation_id}`)
    return Response.json({ action: "cancelled", reason: "lock_lost" })
  }

  // 5. Concatenar mensajes del window
  const windowStart = new Date(thisAt - debounceSeconds * 1000 - 1000).toISOString()
  const { data: recentMsgs } = await supabase
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conversation_id)
    .eq("direction", "inbound")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true })

  const combinedText = recentMsgs && recentMsgs.length > 1
    ? recentMsgs.map((m) => m.content).filter(Boolean).join("\n")
    : content

  console.log(`[worker] INVOKING agente con ${recentMsgs?.length ?? 1} msg(s) — conv=${conversation_id}`)

  // 6. Invocar agente IA
  await invokeAgent(conversation_id, combinedText, wa_id, organization_id)

  return Response.json({ action: "invoked" })
}

// ─── Invocar agente IA ────────────────────────────────────────────────────────

function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL)                   return `https://${process.env.VERCEL_URL}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return appUrl || "http://localhost:3000"
}

async function invokeAgent(conversationId, messageText, waId, organizationId) {
  const baseUrl = getBaseUrl()

  console.log(`[worker] → agent-reply baseUrl=${baseUrl}`)

  const supabase = getServiceClient()

  let res
  try {
    res = await fetch(`${baseUrl}/API/agent-reply`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET || "" },
      body:    JSON.stringify({
        conversation_id: conversationId,
        message_text:    messageText,
        organization_id: organizationId,
      }),
      signal: AbortSignal.timeout(45000),
    })
  } catch (err) {
    const isTimeout = err.name === "TimeoutError" || err.name === "AbortError"
    if (isTimeout) {
      console.error(`[worker] ⏱ agent-reply timeout (>45s) — conv=${conversationId}. Mensaje perdido bajo carga alta.`)
    } else {
      console.error(`[worker] Error llamando agent-reply: ${String(err)}`)
    }
    return
  }

  if (!res.ok) {
    console.error("[worker] agent-reply error:", res.status, await res.text().catch(() => ""))
    return
  }

  const result = await res.json()
  console.log(`[worker] agent-reply action=${result.action}`)

  if (result.action === "escalate") {
    await supabase.from("conversations").update({ mode: "agent" }).eq("id", conversationId)
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      organization_id: organizationId ?? null,
      direction:       "outbound",
      sender_type:     "system",
      sender_name:     "Sistema",
      content_type:    "text",
      content:         `🤖 El agente IA derivó esta conversación a un humano. Motivo: ${result.reason === "keyword" ? "solicitud del usuario" : "decisión del LLM"}.`,
      is_internal:     true,
      status:          "sent",
    })
    return
  }

  if (result.action === "reply" && result.text) {
    // Leer credenciales de WhatsApp de la organización
    let waToken         = process.env.WHATSAPP_TOKEN
    let waPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

    if (organizationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("whatsapp_token, whatsapp_phone_number_id")
        .eq("id", organizationId)
        .maybeSingle()
      if (org?.whatsapp_token)         waToken         = org.whatsapp_token
      if (org?.whatsapp_phone_number_id) waPhoneNumberId = org.whatsapp_phone_number_id
    }

    const version = process.env.META_GRAPH_VERSION || "v23.0"

    const waRes = await fetch(`https://graph.facebook.com/${version}/${waPhoneNumberId}/messages`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to:                waId,
        type:              "text",
        text:              { preview_url: false, body: result.text },
      }),
    })

    const waData      = await waRes.json().catch(() => null)
    const waMessageId = waData?.messages?.[0]?.id ?? null

    if (!waRes.ok) {
      console.error(`[worker] ❌ WhatsApp API error ${waRes.status}:`, JSON.stringify(waData))
      console.error(`[worker] waPhoneNumberId=${waPhoneNumberId} waToken_set=${!!waToken} to=${waId}`)
    } else {
      console.log(`[worker] ✅ WhatsApp enviado waMessageId=${waMessageId}`)
    }

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      organization_id: organizationId ?? null,
      direction:       "outbound",
      sender_type:     "bot",
      sender_name:     result.agent_name ?? "Bot",
      content_type:    "text",
      content:         result.text,
      is_internal:     false,
      wa_message_id:   waMessageId,
      status:          waRes.ok ? "sent" : "failed",
    })

    const botSentAt = new Date().toISOString()
    await supabase
      .from("conversations")
      .update({ last_message: result.text, last_activity: botSentAt, last_bot_at: botSentAt })
      .eq("id", conversationId)

    console.log(`[worker] Bot respondió a ${waId}: "${result.text.slice(0, 60)}…"`)
  }
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * POST /API/agent-worker
 *
 * Estrategia "último gana" sin setTimeout:
 *
 * 1. Registra este mensaje en message_debounce (timestamp + texto)
 * 2. Espera debounce_seconds leyendo periódicamente de Supabase
 *    (polling cada 1s en lugar de setTimeout largo — compatible con Vercel Hobby 10s limit)
 * 3. Si al final sigue siendo el último mensaje, invoca al agente
 *
 * Limitación: con debounce > 8s en plan Hobby puede timeout.
 * Solución recomendada: usar plan Pro (60s) o mantener debounce <= 8s.
 */
export async function POST(req) {
  let body
  try { body = await req.json() } catch { return Response.json({ error: "bad body" }, { status: 400 }) }

  const { conversation_id, content, wa_id, message_timestamp } = body
  if (!conversation_id || !content || !wa_id) {
    return Response.json({ error: "Faltan parámetros" }, { status: 400 })
  }

  // 1. Leer tiempo de debounce desde settings (default 5s)
  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "message_debounce_seconds")
    .maybeSingle()

  const debounceSeconds = Math.max(0, Math.min(8, parseInt(setting?.value ?? "5", 10)))

  console.log(`[worker] START conv=${conversation_id} debounce=${debounceSeconds}s ts=${message_timestamp}`)

  // 2. Registrar este mensaje como candidato (solo si timestamp >= existente)
  const { data: existing } = await supabase
    .from("message_debounce")
    .select("last_message_at")
    .eq("conversation_id", conversation_id)
    .maybeSingle()

  const existingAt = existing ? new Date(existing.last_message_at).getTime() : 0
  const thisAt     = new Date(message_timestamp).getTime()

  if (thisAt >= existingAt) {
    await supabase
      .from("message_debounce")
      .upsert({
        conversation_id: conversation_id,
        last_message_at: message_timestamp,
        pending_text:    content,
      }, { onConflict: "conversation_id" })
    console.log(`[worker] Registrado en debounce conv=${conversation_id}`)
  } else {
    console.log(`[worker] Ignorado (más antiguo) conv=${conversation_id} existing=${existingAt} this=${thisAt}`)
    return Response.json({ action: "skipped", reason: "older_message" })
  }

  // 3. Esperar el tiempo de debounce usando polling cada 500ms
  if (debounceSeconds > 0) {
    const deadline    = Date.now() + debounceSeconds * 1000
    const pollMs      = 500

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs))

      const { data: current } = await supabase
        .from("message_debounce")
        .select("last_message_at")
        .eq("conversation_id", conversation_id)
        .maybeSingle()

      if (!current) {
        console.log(`[worker] Fila eliminada durante espera — conv=${conversation_id}`)
        return Response.json({ action: "cancelled", reason: "row_gone" })
      }

      const latestAt = new Date(current.last_message_at).getTime()
      if (latestAt > thisAt + 500) {
        console.log(`[worker] Mensaje más reciente detectado durante polling (latest=${latestAt} > this=${thisAt}) — cediendo conv=${conversation_id}`)
        return Response.json({ action: "cancelled", reason: "newer_message" })
      }
    }
  }

  // 4. Soy el último mensaje — concatenar todos los mensajes del window
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

  console.log(`[worker] INVOKING agente con ${recentMsgs?.length ?? 1} msg(s): "${combinedText.slice(0, 80)}" — conv=${conversation_id}`)

  // 5. Limpiar fila de debounce
  await supabase
    .from("message_debounce")
    .delete()
    .eq("conversation_id", conversation_id)

  // 6. Invocar agente IA
  await invokeAgent(conversation_id, combinedText, wa_id)

  return Response.json({ action: "invoked" })
}

// ─── Invocar agente IA ────────────────────────────────────────────────────────

async function invokeAgent(conversationId, messageText, waId) {
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl && process.env.VERCEL_URL) baseUrl = `https://${process.env.VERCEL_URL}`
  if (!baseUrl) baseUrl = "http://localhost:3000"

  console.log(`[worker] → agent-reply baseUrl=${baseUrl}`)

  const res = await fetch(`${baseUrl}/API/agent-reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ conversation_id: conversationId, message_text: messageText }),
  })

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
    const token         = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const version       = process.env.META_GRAPH_VERSION || "v23.0"

    const waRes = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction:       "outbound",
      sender_type:     "bot",
      sender_name:     result.agent_name ?? "Bot",
      content_type:    "text",
      content:         result.text,
      is_internal:     false,
      wa_message_id:   waMessageId,
      status:          waRes.ok ? "sent" : "failed",
    })

    await supabase
      .from("conversations")
      .update({ last_message: result.text, last_activity: new Date().toISOString() })
      .eq("id", conversationId)

    console.log(`[worker] Bot respondió a ${waId}: "${result.text.slice(0, 60)}…"`)
  }
}

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * POST /API/agent-worker
 *
 * Recibe { conversation_id, content, wa_id, message_timestamp }
 * Espera el tiempo de debounce configurado, verifica si hay mensajes más nuevos,
 * y si es el último invoca al agente IA.
 *
 * Este endpoint es llamado por el webhook en fire-and-forget (sin await),
 * lo que permite al webhook responder 200 a Meta de inmediato mientras
 * este worker sigue ejecutándose en su propia request de Vercel.
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

  const debounceSeconds = Math.max(0, parseInt(setting?.value ?? "5", 10))

  console.log(`[worker] conv=${conversation_id} debounce=${debounceSeconds}s ts=${message_timestamp}`)

  // 2. Registrar este mensaje como el último visto (solo si es más reciente que el existente)
  // Usamos upsert pero con un check: no retroceder si ya hay un timestamp mayor
  const { data: existingRow } = await supabase
    .from("message_debounce")
    .select("last_message_at")
    .eq("conversation_id", conversation_id)
    .maybeSingle()

  const existingAt = existingRow ? new Date(existingRow.last_message_at).getTime() : 0
  const thisAt     = new Date(message_timestamp).getTime()

  if (thisAt >= existingAt) {
    await supabase
      .from("message_debounce")
      .upsert({
        conversation_id: conversation_id,
        last_message_at: message_timestamp,
        pending_text:    content,
      }, { onConflict: "conversation_id" })
  }

  // 3. Si debounce > 0, esperar
  if (debounceSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, debounceSeconds * 1000))
  }

  // 4. Volver a leer: ¿llegó un mensaje más nuevo mientras esperábamos?
  const { data: debounceRow } = await supabase
    .from("message_debounce")
    .select("last_message_at, pending_text")
    .eq("conversation_id", conversation_id)
    .maybeSingle()

  if (!debounceRow) {
    console.log(`[worker] Fila debounce eliminada — cancelando conv=${conversation_id}`)
    return Response.json({ action: "cancelled", reason: "debounce_row_gone" })
  }

  const storedAt  = new Date(debounceRow.last_message_at).getTime()
  const currentAt = new Date(message_timestamp).getTime()

  // Ceder si hay un mensaje más reciente (o igual pero con pequeña tolerancia de 500ms para race conditions)
  if (storedAt > currentAt + 500) {
    console.log(`[worker] Mensaje más reciente detectado (stored=${storedAt} > current=${currentAt}) — cediendo paso conv=${conversation_id}`)
    return Response.json({ action: "cancelled", reason: "newer_message" })
  }

  // 4. Este es el último mensaje — concatenar mensajes recientes para el agente
  const windowStart = new Date(currentAt - debounceSeconds * 1000 - 2000).toISOString()
  const { data: recentMsgs } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversation_id)
    .eq("direction", "inbound")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: true })

  const combinedText = recentMsgs && recentMsgs.length > 1
    ? recentMsgs.map((m) => m.content).filter(Boolean).join("\n")
    : content

  console.log(`[worker] Invocando agente con ${recentMsgs?.length ?? 1} mensaje(s) — conv=${conversation_id}`)

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

  console.log(`[worker] Llamando agent-reply → ${baseUrl}/API/agent-reply`)

  const res = await fetch(`${baseUrl}/API/agent-reply`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ conversation_id: conversationId, message_text: messageText }),
  })

  if (!res.ok) {
    console.error("[worker] agent-reply error:", res.status)
    return
  }

  const result = await res.json()
  console.log(`[worker] agent-reply action: ${result.action}`)

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
    const phone         = "+" + waId
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

import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ─── GET: verificación del webhook por Meta ───────────────────────────────────
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get("hub.mode")
  const token     = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[webhook] Verificación exitosa")
    return new Response(challenge, { status: 200 })
  }

  console.warn("[webhook] Verificación fallida", { mode, token })
  return new Response("Forbidden", { status: 403 })
}

// ─── POST: mensajes y eventos entrantes de Meta ───────────────────────────────
export async function POST(req) {
  // 1. Verificar firma HMAC-SHA256
  const rawBody = await req.text()
  const signature = req.headers.get("x-hub-signature-256") || ""
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (appSecret) {
    const expected = "sha256=" + crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex")

    if (signature !== expected) {
      console.warn("[webhook] Firma inválida")
      return new Response("Unauthorized", { status: 401 })
    }
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response("Bad Request", { status: 400 })
  }

  // 2. Guardar evento raw para debugging
  await supabase.from("webhook_events").insert({
    event_type: "incoming",
    payload: body,
    processed: false,
  }).then(({ error }) => {
    if (error) console.error("[webhook] Error guardando evento:", error.message)
  })

  // 3. Procesar cada entrada
  const entries = body?.entry ?? []
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== "messages") continue
      const value = change.value

      // 3a. Mensajes entrantes
      for (const msg of value?.messages ?? []) {
        await processInboundMessage(msg, value.contacts?.[0], value.metadata)
      }

      // 3b. Actualizaciones de estado (entregado, leído, etc.)
      for (const status of value?.statuses ?? []) {
        await processStatusUpdate(status)
      }
    }
  }

  // Meta espera siempre un 200 inmediato
  return new Response("OK", { status: 200 })
}

// ─── Procesar mensaje entrante ────────────────────────────────────────────────
async function processInboundMessage(msg, waContact, metadata) {
  const waId        = msg.from                         // número del contacto (sin +)
  const waMessageId = msg.id
  const timestamp   = new Date(parseInt(msg.timestamp) * 1000).toISOString()

  // Deduplicar: si ya procesamos este mensaje, ignorar
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .maybeSingle()

  if (existing) return

  // Extraer texto o caption según tipo de mensaje
  const contentType = msg.type ?? "text"
  let content    = null
  let mediaUrl   = null
  let mediaMime  = null

  if (contentType === "text") {
    content = msg.text?.body ?? ""
  } else if (["image", "video", "audio", "document", "sticker"].includes(contentType)) {
    const mediaObj = msg[contentType]
    content   = mediaObj?.caption ?? null
    mediaMime = mediaObj?.mime_type ?? null
    // La URL real se obtiene via API de Media — guardamos el media ID por ahora
    mediaUrl  = mediaObj?.id ? `media:${mediaObj.id}` : null
  } else if (contentType === "location") {
    content = `📍 ${msg.location?.name ?? ""} (${msg.location?.latitude}, ${msg.location?.longitude})`
  } else if (contentType === "interactive") {
    content = msg.interactive?.button_reply?.title
           || msg.interactive?.list_reply?.title
           || JSON.stringify(msg.interactive)
  } else {
    content = JSON.stringify(msg)
  }

  // Buscar o crear contacto por número de teléfono
  const phone = "+" + waId
  let { data: contact } = await supabase
    .from("contacts")
    .select("id, name")
    .eq("phone", phone)
    .maybeSingle()

  if (!contact) {
    const displayName = waContact?.profile?.name ?? phone
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert({ name: displayName, phone })
      .select("id, name")
      .single()

    if (error) {
      console.error("[webhook] Error creando contacto:", error.message)
      return
    }
    contact = newContact
  }

  // Buscar o crear conversación activa para este contacto/canal
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) {
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        contact_id:     contact.id,
        channel:        "whatsapp",
        status:         "open",
        mode:           "bot",
        pipeline_stage: "Nuevo contacto",
        wa_contact_id:  waId,
        last_message:   content,
        last_activity:  timestamp,
        unread_count:   1,
      })
      .select("id, unread_count")
      .single()

    if (error) {
      console.error("[webhook] Error creando conversación:", error.message)
      return
    }
    conversation = newConv
  } else {
    // Actualizar conversación existente
    await supabase
      .from("conversations")
      .update({
        last_message:  content,
        last_activity: timestamp,
        unread_count:  (conversation.unread_count ?? 0) + 1,
      })
      .eq("id", conversation.id)
  }

  // Insertar mensaje
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction:       "inbound",
    sender_type:     "contact",
    sender_name:     waContact?.profile?.name ?? phone,
    content_type:    contentType,
    content,
    media_url:       mediaUrl,
    media_mime:      mediaMime,
    wa_message_id:   waMessageId,
    status:          "received",
    created_at:      timestamp,
  })

  if (msgError) {
    console.error("[webhook] Error guardando mensaje:", msgError.message)
    return
  }

  console.log(`[webhook] Mensaje guardado: ${waId} → conv ${conversation.id}`)

  // Invocar al agente IA si la conversación está en modo bot y el mensaje es texto
  if (contentType === "text" && content) {
    // No bloqueamos — lo hacemos en background para responder a Meta rápido
    invokeAgent(conversation.id, content, waId).catch((e) =>
      console.error("[webhook] Error invocando agente:", e.message)
    )
  }

  // Marcar evento como procesado
  await supabase
    .from("webhook_events")
    .update({ processed: true })
    .eq("payload->>id", msg.id)
    .then(() => {})
}

// ─── Invocar agente IA y enviar respuesta ─────────────────────────────────────
async function invokeAgent(conversationId, messageText, waId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000"

  // Llamar al endpoint del agente
  const res = await fetch(`${baseUrl}/API/agent-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, message_text: messageText }),
  })

  if (!res.ok) {
    console.error("[webhook] agent-reply error:", res.status)
    return
  }

  const result = await res.json()
  console.log(`[webhook] agent-reply action: ${result.action}`)

  if (result.action === "escalate") {
    // Cambiar conversación a modo humano
    await supabase
      .from("conversations")
      .update({ mode: "agent" })
      .eq("id", conversationId)

    // Guardar nota interna
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

    console.log(`[webhook] Conversación ${conversationId} escalada a humano`)
    return
  }

  if (result.action === "reply" && result.text) {
    const phone = "+" + waId
    const token         = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const version       = process.env.META_GRAPH_VERSION || "v23.0"

    // Enviar por WhatsApp
    const waRes = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type:    "individual",
        to:                waId,
        type:              "text",
        text:              { preview_url: false, body: result.text },
      }),
    })

    const waData = await waRes.json().catch(() => null)
    const waMessageId = waData?.messages?.[0]?.id ?? null

    // Guardar respuesta del bot en DB
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

    // Actualizar last_message de la conversación
    await supabase
      .from("conversations")
      .update({ last_message: result.text, last_activity: new Date().toISOString() })
      .eq("id", conversationId)

    console.log(`[webhook] Bot respondió a ${waId}: "${result.text.slice(0, 60)}…"`)
  }
}

// ─── Actualizar estado de mensaje saliente ────────────────────────────────────
async function processStatusUpdate(status) {
  const waMessageId = status.id
  const newStatus   = status.status  // sent | delivered | read | failed

  await supabase
    .from("messages")
    .update({ status: newStatus })
    .eq("wa_message_id", waMessageId)
}

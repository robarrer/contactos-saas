import { after } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ─── GET: verificación del webhook por Meta ───────────────────────────────────
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get("hub.mode")
  const token     = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  // Verificar contra cualquier organización que tenga ese verify_token
  const supabase = getServiceClient()
  const { data: org } = await supabase
    .from("organizations")
    .select("id, whatsapp_verify_token")
    .eq("whatsapp_verify_token", token)
    .maybeSingle()

  // Fallback a variable de entorno (para desarrollo local)
  const envToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  const valid    = mode === "subscribe" && (org !== null || token === envToken)

  if (valid) {
    console.log("[webhook] Verificación exitosa")
    return new Response(challenge, { status: 200 })
  }

  console.warn("[webhook] Verificación fallida", { mode, token })
  return new Response("Forbidden", { status: 403 })
}

// ─── POST: mensajes y eventos entrantes de Meta ───────────────────────────────
export async function POST(req) {
  const rawBody   = await req.text()
  const signature = req.headers.get("x-hub-signature-256") || ""

  let body
  try { body = JSON.parse(rawBody) } catch {
    return new Response("Bad Request", { status: 400 })
  }

  const supabase = getServiceClient()

  // Identificar organización por phone_number_id del payload
  const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null
  let organization = null

  if (phoneNumberId) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, whatsapp_app_secret, whatsapp_token, whatsapp_phone_number_id, whatsapp_verify_token")
      .eq("whatsapp_phone_number_id", phoneNumberId)
      .maybeSingle()
    organization = org
  }

  // Fallback: usar env vars (compatibilidad con setup de un solo tenant)
  const appSecret = organization?.whatsapp_app_secret || process.env.WHATSAPP_APP_SECRET

  // Verificar firma HMAC — obligatorio
  if (!appSecret) {
    console.error("[webhook] CRÍTICO: No hay whatsapp_app_secret configurado. Rechazando request.")
    return new Response("Service Unavailable", { status: 503 })
  }

  const expected = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex")

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      console.warn("[webhook] Firma HMAC inválida")
      return new Response("Unauthorized", { status: 401 })
    }
  } catch {
    console.warn("[webhook] Firma HMAC inválida (formato incorrecto)")
    return new Response("Unauthorized", { status: 401 })
  }

  const orgId = organization?.id ?? null

  // Guardar evento raw
  await supabase.from("webhook_events").insert({
    event_type:      "incoming",
    payload:         body,
    processed:       false,
    organization_id: orgId,
  }).then(({ error }) => {
    if (error) console.error("[webhook] Error guardando evento:", error.message)
  })

  // Procesar entradas
  const entries = body?.entry ?? []
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      if (change.field !== "messages") continue
      const value = change.value

      for (const msg of value?.messages ?? []) {
        await processInboundMessage(msg, value.contacts?.[0], value.metadata, orgId, supabase)
      }

      for (const status of value?.statuses ?? []) {
        await processStatusUpdate(status, supabase)
      }
    }
  }

  return new Response("OK", { status: 200 })
}

// ─── Procesar mensaje entrante ────────────────────────────────────────────────
async function processInboundMessage(msg, waContact, metadata, orgId, supabase) {
  const waId        = msg.from
  const waMessageId = msg.id
  const timestamp   = new Date(parseInt(msg.timestamp) * 1000).toISOString()

  // Deduplicar
  const { data: existing } = await supabase
    .from("messages")
    .select("id")
    .eq("wa_message_id", waMessageId)
    .maybeSingle()
  if (existing) return

  // Extraer contenido
  const contentType = msg.type ?? "text"
  let content   = null
  let mediaUrl  = null
  let mediaMime = null

  if (contentType === "text") {
    content = msg.text?.body ?? ""
  } else if (["image", "video", "audio", "document", "sticker"].includes(contentType)) {
    const mediaObj = msg[contentType]
    content   = mediaObj?.caption ?? null
    mediaMime = mediaObj?.mime_type ?? null
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

  // Buscar o crear contacto — phone normalizado siempre con "+"
  const phone = "+" + waId

  let contact = null

  // Buscar por phone normalizado en la org
  if (orgId) {
    const { data } = await supabase.from("contacts").select("id, first_name, last_name")
      .eq("phone", phone).eq("organization_id", orgId).maybeSingle()
    contact = data
  }

  // Fallback: contacto huérfano (sin org_id), lo vinculamos a la org
  if (!contact) {
    const { data } = await supabase.from("contacts").select("id, first_name, last_name")
      .eq("phone", phone).is("organization_id", null).maybeSingle()
    if (data) {
      if (orgId) await supabase.from("contacts").update({ organization_id: orgId }).eq("id", data.id)
      contact = data
    }
  }

  if (!contact) {
    const displayName = waContact?.profile?.name ?? phone
    const nameParts = displayName.trim().split(/\s+/)
    const firstName = nameParts[0] || ""
    const lastName  = nameParts.slice(1).join(" ") || ""
    const { data: newContact, error } = await supabase
      .from("contacts")
      .insert({ first_name: firstName, last_name: lastName, phone, organization_id: orgId })
      .select("id, first_name, last_name")
      .single()

    if (error) {
      // Condición de carrera: otro request ya creó el contacto (unique violation)
      if (error.code === "23505") {
        const { data: existing } = await supabase.from("contacts").select("id, first_name, last_name")
          .eq("phone", phone).eq("organization_id", orgId).maybeSingle()
        if (existing) {
          contact = existing
        } else {
          console.error("[webhook] Error creando contacto:", error.message)
          return
        }
      } else {
        console.error("[webhook] Error creando contacto:", error.message)
        return
      }
    } else {
      contact = newContact
    }
  }

  // Buscar o crear conversación
  const convQuery = supabase
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
  if (orgId) convQuery.eq("organization_id", orgId)

  let { data: conversation } = await convQuery.maybeSingle()

  if (!conversation) {
    // Obtener la primera etapa del embudo
    let defaultStage = "Nuevo contacto"
    const { data: firstStage, error: stageError } = await supabase
      .from("pipeline_stages")
      .select("name")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle()
    console.log("[webhook] pipeline_stages query:", { firstStage, stageError, orgId })
    if (firstStage?.name) defaultStage = firstStage.name
    console.log("[webhook] defaultStage resuelto:", defaultStage)

    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        contact_id:      contact.id,
        channel:         "whatsapp",
        status:          "open",
        mode:            "bot",
        pipeline_stage:  defaultStage,
        wa_contact_id:   waId,
        last_message:    content,
        last_activity:   timestamp,
        last_inbound_at: timestamp,
        unread_count:    1,
        organization_id: orgId,
      })
      .select("id, unread_count")
      .single()

    if (error) {
      console.error("[webhook] Error creando conversación:", error.message)
      return
    }
    conversation = newConv
  } else {
    await supabase
      .from("conversations")
      .update({
        last_message:    content,
        last_activity:   timestamp,
        last_inbound_at: timestamp,
        unread_count:    (conversation.unread_count ?? 0) + 1,
        followup_sent:   [],   // el contacto respondió → resetear ciclo de seguimientos
      })
      .eq("id", conversation.id)
  }

  // Insertar mensaje
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    organization_id: orgId,
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

  console.log(`[webhook] Mensaje guardado: ${waId} → conv ${conversation.id} org=${orgId}`)

  // Invocar worker (fire-and-forget)
  if (contentType === "text" && content) {
    scheduleWorker(conversation.id, content, waId, timestamp, orgId)
  }
}

// ─── Base URL para llamadas internas ─────────────────────────────────────────
function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL)                   return `https://${process.env.VERCEL_URL}`
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  return appUrl || "http://localhost:3000"
}

// ─── Llamar al worker usando after() para garantizar ejecución post-respuesta ─
function scheduleWorker(conversationId, content, waId, messageTimestamp, organizationId) {
  const baseUrl = getBaseUrl()
  console.log(`[webhook] Scheduling worker conv=${conversationId} org=${organizationId} url=${baseUrl}`)

  after(
    fetch(`${baseUrl}/API/agent-worker`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET || "" },
      body:    JSON.stringify({
        conversation_id:   conversationId,
        content,
        wa_id:             waId,
        message_timestamp: messageTimestamp,
        organization_id:   organizationId,
      }),
    })
    .then((res) => {
      console.log(`[webhook] agent-worker respondió status=${res.status} conv=${conversationId}`)
    })
    .catch((e) => {
      console.error(`[webhook] Error llamando worker: ${e.message}`)
    })
  )
}

// ─── Actualizar estado de mensaje saliente ────────────────────────────────────
async function processStatusUpdate(status, supabase) {
  await supabase
    .from("messages")
    .update({ status: status.status })
    .eq("wa_message_id", status.id)
}

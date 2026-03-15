import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export async function POST(req) {
  const token         = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "786386161226350"
  const version       = process.env.META_GRAPH_VERSION || "v22.0"
  const url           = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  try {
    const body             = await req.json()
    const recipients       = Array.isArray(body?.recipients) ? body.recipients : []
    const templateName     = body?.template_name
    const templateLanguage = body?.template_language || "en_US"
    const templateRendered = body?.template_rendered ?? null  // texto ya renderizado para guardar en DB

    if (!recipients.length) {
      return Response.json({ error: "No se recibieron destinatarios para enviar." }, { status: 400 })
    }
    if (!templateName) {
      return Response.json({ error: "No se indicó template_name." }, { status: 400 })
    }

    const results = []

    for (const recipient of recipients) {
      const phone = String(recipient.phone ?? "").trim()
      if (!phone) continue

      const params = Array.isArray(recipient.parameters) ? recipient.parameters : []
      const components = params.length > 0
        ? [{ type: "body", parameters: params.map((val) => ({ type: "text", text: String(val) })) }]
        : []

      const payload = {
        messaging_product: "whatsapp",
        to:                phone,
        type:              "template",
        template: {
          name:     templateName,
          language: { code: templateLanguage },
          ...(components.length > 0 ? { components } : {}),
        },
      }

      const response = await fetch(url, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })

      const data        = await response.json().catch(() => null)
      const waMessageId = data?.messages?.[0]?.id ?? null

      results.push({ to: phone, status: response.status, ok: response.ok, response: data })

      // Guardar en DB si el envío fue exitoso
      if (response.ok) {
        await saveTemplateMessage({
          phone,
          templateName,
          templateRendered: templateRendered ?? recipient.templateRendered ?? null,
          waMessageId,
          status: "sent",
        })
      }
    }

    return Response.json({ results })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

// ─── Guardar mensaje de plantilla en Supabase ─────────────────────────────────

async function saveTemplateMessage({ phone, templateName, templateRendered, waMessageId, status }) {
  // Normalizar el teléfono (con o sin +)
  const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`

  // Buscar contacto por teléfono
  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle()

  if (!contact) return  // sin contacto, no podemos asociar la conversación

  // Buscar conversación activa de WhatsApp para este contacto
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, last_activity")
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!conversation) return  // no hay conversación activa

  const now = new Date().toISOString()

  // Insertar mensaje con content_type = "template"
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction:       "outbound",
    sender_type:     "agent",
    sender_name:     `template:${templateName}`,   // prefijo para identificar en el mapper
    content_type:    "template",
    content:         templateRendered ?? templateName,  // texto renderizado o nombre como fallback
    is_internal:     false,
    wa_message_id:   waMessageId,
    status,
    created_at:      now,
  })

  // Actualizar last_message de la conversación
  await supabase
    .from("conversations")
    .update({ last_message: `📋 Plantilla: ${templateName}`, last_activity: now })
    .eq("id", conversation.id)
}

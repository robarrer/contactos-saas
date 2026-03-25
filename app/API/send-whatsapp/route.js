import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const body = await req.json()

    const recipients       = Array.isArray(body?.recipients) ? body.recipients : []
    const templateName     = body?.template_name
    const templateLanguage = body?.template_language || "en_US"
    const templateRendered = body?.template_rendered ?? null

    if (!recipients.length) {
      return Response.json({ error: "No se recibieron destinatarios." }, { status: 400 })
    }
    if (!templateName) {
      return Response.json({ error: "No se indicó template_name." }, { status: 400 })
    }

    // Obtener organización del usuario autenticado (sesión del browser)
    let orgId = null
    let waToken         = process.env.WHATSAPP_TOKEN
    let waPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "786386161226350"

    try {
      const serverClient = await createSupabaseServerClient()
      const { data: { user } } = await serverClient.auth.getUser()
      if (user) {
        const supabase = getServiceClient()
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle()

        if (profile?.organization_id) {
          orgId = profile.organization_id
          const { data: org } = await supabase
            .from("organizations")
            .select("whatsapp_token, whatsapp_phone_number_id")
            .eq("id", orgId)
            .maybeSingle()
          if (org?.whatsapp_token)           waToken         = org.whatsapp_token
          if (org?.whatsapp_phone_number_id) waPhoneNumberId = org.whatsapp_phone_number_id
        }
      }
    } catch {
      // Sin sesión activa — usar env vars (compatibilidad)
    }

    const version = process.env.META_GRAPH_VERSION || "v22.0"
    const url     = `https://graph.facebook.com/${version}/${waPhoneNumberId}/messages`
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
        headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      })

      const data        = await response.json().catch(() => null)
      const waMessageId = data?.messages?.[0]?.id ?? null

      results.push({ to: phone, status: response.status, ok: response.ok, response: data })

      if (response.ok) {
        await saveTemplateMessage({
          phone,
          templateName,
          templateRendered: templateRendered ?? recipient.templateRendered ?? null,
          waMessageId,
          status:           "sent",
          orgId,
        })
      } else {
        // Guardar envíos fallidos para que aparezcan en el log de plantillas
        const errorMsg = data?.error
          ? (data.error.message ?? JSON.stringify(data.error))
          : `HTTP ${response.status}`
        await saveTemplateMessage({
          phone,
          templateName,
          templateRendered: null,
          waMessageId:      null,
          status:           "failed",
          orgId,
          errorMessage:     errorMsg,
        })
      }
    }

    return Response.json({ results })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

// ─── Buscar contacto por teléfono con fallback sin filtro de org ─────────────
// Contactos creados desde el dashboard no tienen organization_id; los creados
// desde el webhook sí. Probamos las 4 combinaciones (+/sin +, con/sin org).
async function findContact(supabase, phoneWith, phoneWithout, orgId) {
  const phones = [phoneWith, phoneWithout]
  // Primero con filtro de org (match más específico)
  if (orgId) {
    for (const p of phones) {
      const { data } = await supabase
        .from("contacts").select("id").eq("phone", p).eq("organization_id", orgId).maybeSingle()
      if (data) return data
    }
  }
  // Fallback sin filtro de org (contactos creados desde dashboard con org_id = NULL)
  for (const p of phones) {
    const { data } = await supabase
      .from("contacts").select("id").eq("phone", p).is("organization_id", null).maybeSingle()
    if (data) {
      // Asociar contacto huérfano a la org actual
      if (orgId) await supabase.from("contacts").update({ organization_id: orgId }).eq("id", data.id)
      return data
    }
  }
  return null
}

// ─── Guardar mensaje de plantilla en Supabase ─────────────────────────────────

async function saveTemplateMessage({ phone, templateName, templateRendered, waMessageId, status, orgId, errorMessage = null }) {
  const supabase = getServiceClient()
  const normalizedPhone = phone.startsWith("+") ? phone : `+${phone}`

  const phoneWithout = normalizedPhone.replace(/^\+/, "")
  let contact = await findContact(supabase, normalizedPhone, phoneWithout, orgId)

  if (!contact) {
    const { data: newContact, error: contactError } = await supabase
      .from("contacts")
      .insert({ phone: normalizedPhone, first_name: phoneWithout, organization_id: orgId ?? null })
      .select("id")
      .single()
    if (contactError) {
      // Condición de carrera: el contacto ya fue creado por otro proceso
      if (contactError.code === "23505") {
        const { data: existing } = await supabase
          .from("contacts").select("id")
          .eq("phone", normalizedPhone).eq("organization_id", orgId).maybeSingle()
        if (existing) {
          contact = existing
        } else {
          console.error("[send-whatsapp] Error creando contacto:", contactError.message)
          return
        }
      } else {
        console.error("[send-whatsapp] Error creando contacto:", contactError.message)
        return
      }
    } else {
      contact = newContact
    }
  }

  // Buscar o crear conversación
  let convQuery = supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contact.id)
    .eq("channel", "whatsapp")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
  if (orgId) convQuery = convQuery.eq("organization_id", orgId)

  let { data: conversation } = await convQuery.maybeSingle()

  if (!conversation) {
    // Obtener la primera etapa del embudo de la org
    let defaultStage = "Nuevo contacto"
    let stageQuery = supabase
      .from("pipeline_stages")
      .select("name")
      .order("position", { ascending: true })
      .limit(1)
    if (orgId) stageQuery = stageQuery.eq("organization_id", orgId)
    const { data: firstStage } = await stageQuery.maybeSingle()
    if (firstStage?.name) defaultStage = firstStage.name

    const now = new Date().toISOString()
    const { data: newConv, error: convError } = await supabase
      .from("conversations")
      .insert({
        contact_id:      contact.id,
        channel:         "whatsapp",
        status:          "open",
        mode:            "bot",
        pipeline_stage:  defaultStage,
        last_message:    `📋 Plantilla: ${templateName}`,
        last_activity:   now,
        unread_count:    0,
        organization_id: orgId ?? null,
      })
      .select("id")
      .single()

    if (convError) {
      console.error("[send-whatsapp] Error creando conversación:", convError.message)
      return
    }
    conversation = newConv
  }

  const now = new Date().toISOString()

  const contentValue = status === "failed"
    ? (errorMessage ?? "Error desconocido")
    : (templateRendered ?? templateName)

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    organization_id: orgId ?? null,
    direction:       "outbound",
    sender_type:     "agent",
    sender_name:     `template:${templateName}`,
    content_type:    "template",
    content:         contentValue,
    is_internal:     false,
    wa_message_id:   waMessageId,
    status,
    created_at:      now,
  })

  // Actualizar conversación con último mensaje y modo bot
  await supabase
    .from("conversations")
    .update({ last_message: `📋 Plantilla: ${templateName}`, last_activity: now, mode: "bot" })
    .eq("id", conversation.id)
}

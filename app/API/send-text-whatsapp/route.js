/**
 * POST /API/send-text-whatsapp
 * Envía un mensaje de texto libre por WhatsApp a un número.
 * Requiere que la conversación tenga una ventana de 24h abierta
 * (el contacto debe haber enviado un mensaje primero).
 */
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  const version = process.env.META_GRAPH_VERSION || "v23.0"

  // ── Resolver organización del usuario autenticado ──────────────────────────
  let waToken         = null
  let waPhoneNumberId = null

  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()

    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabase = getServiceClient()
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()

    if (!profile?.organization_id) {
      return Response.json({ error: "El usuario no tiene organización asignada" }, { status: 403 })
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("whatsapp_token, whatsapp_phone_number_id")
      .eq("id", profile.organization_id)
      .maybeSingle()

    waToken         = org?.whatsapp_token         || process.env.WHATSAPP_TOKEN
    waPhoneNumberId = org?.whatsapp_phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID
  } catch (err) {
    console.error("[send-text-whatsapp] Error resolviendo organización:", err)
    return Response.json({ error: "Error interno al resolver organización" }, { status: 500 })
  }

  if (!waToken || !waPhoneNumberId) {
    return Response.json(
      { error: "La organización no tiene credenciales de WhatsApp configuradas" },
      { status: 500 }
    )
  }

  // ── Parsear body ───────────────────────────────────────────────────────────
  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Body inválido" }, { status: 400 })
  }

  const { phone, text } = body

  if (!phone || !text) {
    return Response.json(
      { error: "Se requieren los campos 'phone' y 'text'" },
      { status: 400 }
    )
  }

  // Normalizar número: quitar + si viene con él
  const to = String(phone).replace(/^\+/, "")

  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              "text",
    text: {
      preview_url: false,
      body:        String(text),
    },
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${waPhoneNumberId}/messages`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${waToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    )

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return Response.json(
        { error: data?.error?.message || "Error al enviar mensaje", meta: data?.error },
        { status: response.status }
      )
    }

    return Response.json({ ok: true, message_id: data?.messages?.[0]?.id })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

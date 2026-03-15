/**
 * POST /API/send-text-whatsapp
 * Envía un mensaje de texto libre por WhatsApp a un número.
 * Requiere que la conversación tenga una ventana de 24h abierta
 * (el contacto debe haber enviado un mensaje primero).
 */
export async function POST(req) {
  const token         = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version       = process.env.META_GRAPH_VERSION || "v23.0"

  if (!token || !phoneNumberId) {
    return Response.json(
      { error: "Faltan variables de entorno: WHATSAPP_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID" },
      { status: 500 }
    )
  }

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
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${token}`,
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

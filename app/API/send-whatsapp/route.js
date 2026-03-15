export async function POST(req) {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "786386161226350"
  const version = process.env.META_GRAPH_VERSION || "v22.0"
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`

  try {
    const body = await req.json()
    const recipients = Array.isArray(body?.recipients) ? body.recipients : []
    const templateName = body?.template_name
    const templateLanguage = body?.template_language || "en_US"

    if (!recipients.length) {
      return Response.json(
        { error: "No se recibieron destinatarios para enviar." },
        { status: 400 }
      )
    }

    if (!templateName) {
      return Response.json(
        { error: "No se indicó template_name." },
        { status: 400 }
      )
    }

    const results = []

    for (const recipient of recipients) {
      const phone = String(recipient.phone ?? "").trim()
      if (!phone) continue

      const components = []
      const params = Array.isArray(recipient.parameters)
        ? recipient.parameters
        : []

      if (params.length > 0) {
        components.push({
          type: "body",
          parameters: params.map((val) => ({
            type: "text",
            text: String(val),
          })),
        })
      }

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          ...(components.length > 0 ? { components } : {}),
        },
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json().catch(() => null)
      results.push({
        to: phone,
        status: response.status,
        ok: response.ok,
        response: data,
      })
    }

    return Response.json({ results })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/list-templates
 * Lista las plantillas de mensaje de WhatsApp disponibles en la cuenta de Meta.
 * Usa: WHATSAPP_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID, opcional META_GRAPH_VERSION
 */
export async function GET(req) {
  const token = process.env.WHATSAPP_TOKEN
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const version = process.env.META_GRAPH_VERSION || "v22.0"

  if (!token || !wabaId) {
    return Response.json(
      {
        error:
          "Faltan variables de entorno: WHATSAPP_TOKEN y/o WHATSAPP_BUSINESS_ACCOUNT_ID",
      },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "APPROVED"
  const limit = Math.min(
    parseInt(searchParams.get("limit"), 10) || 50,
    100
  )

  const url = new URL(
    `https://graph.facebook.com/${version}/${wabaId}/message_templates`
  )
  url.searchParams.set("limit", String(limit))
  if (status) url.searchParams.set("status", status)
  // Pedir campos explícitos para obtener el contenido de cada plantilla (components con text)
  url.searchParams.set(
    "fields",
    "name,status,category,language,components"
  )

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return Response.json(
        {
          error: data?.error?.message || "Error al obtener plantillas de Meta",
          meta: data?.error,
        },
        { status: response.status }
      )
    }

    return Response.json({
      templates: data?.data ?? [],
      paging: data?.paging ?? null,
    })
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

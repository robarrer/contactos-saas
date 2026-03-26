/**
 * GET /API/media/[mediaId]
 * Proxy para descargar medios de WhatsApp. Los mensajes recibidos almacenan
 * el media ID de Graph API (prefijo "media:") en lugar de una URL pública.
 * Esta ruta resuelve el ID a una URL temporal y devuelve el binario al cliente.
 */
export async function GET(req, { params }) {
  const { mediaId } = await params

  if (!mediaId) {
    return new Response("mediaId requerido", { status: 400 })
  }

  const token   = process.env.WHATSAPP_TOKEN
  const version = process.env.META_GRAPH_VERSION || "v23.0"

  if (!token) {
    return new Response("Falta WHATSAPP_TOKEN", { status: 500 })
  }

  // Paso 1: obtener metadatos del media (URL temporal + mime_type) desde Graph API
  let meta
  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${version}/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!metaRes.ok) {
      const err = await metaRes.json().catch(() => ({}))
      console.error("[media-proxy] Error obteniendo metadata:", err)
      return new Response("Media no encontrado", { status: 404 })
    }
    meta = await metaRes.json()
  } catch (e) {
    console.error("[media-proxy] Error de red al obtener metadata:", e)
    return new Response("Error al obtener metadata", { status: 502 })
  }

  if (!meta?.url) {
    return new Response("URL de media no disponible", { status: 404 })
  }

  // Paso 2: descargar el binario del media
  let binaryRes
  try {
    binaryRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!binaryRes.ok) {
      console.error("[media-proxy] Error descargando binary, status:", binaryRes.status)
      return new Response("Error al descargar archivo", { status: 502 })
    }
  } catch (e) {
    console.error("[media-proxy] Error de red al descargar binary:", e)
    return new Response("Error de red", { status: 502 })
  }

  const contentType = meta.mime_type
    || binaryRes.headers.get("content-type")
    || "application/octet-stream"

  const buffer = await binaryRes.arrayBuffer()

  return new Response(buffer, {
    headers: {
      "Content-Type":  contentType,
      "Cache-Control": "private, max-age=3600",
    },
  })
}

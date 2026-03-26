/**
 * POST /API/send-media-whatsapp
 * Sube un archivo a la Media API de WhatsApp y lo envía como mensaje.
 *
 * Body: multipart/form-data
 *   file      - Archivo a enviar (File/Blob)
 *   phone     - Número destinatario (con o sin +)
 *   mediaType - "image" | "document" | "audio" | "video"
 *   caption   - (opcional) Texto/caption del archivo
 *
 * Responde: { ok: true, media_id, message_id }
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

  let formData
  try {
    formData = await req.formData()
  } catch {
    return Response.json({ error: "Body inválido (se esperaba multipart/form-data)" }, { status: 400 })
  }

  const file      = formData.get("file")
  const phone     = formData.get("phone")
  const mediaType = formData.get("mediaType")
  const caption   = formData.get("caption") ?? ""

  if (!file || !phone || !mediaType) {
    return Response.json(
      { error: "Se requieren los campos: file, phone, mediaType" },
      { status: 400 }
    )
  }

  const validTypes = ["image", "document", "audio", "video"]
  if (!validTypes.includes(String(mediaType))) {
    return Response.json(
      { error: `mediaType inválido. Valores permitidos: ${validTypes.join(", ")}` },
      { status: 400 }
    )
  }

  const to = String(phone).replace(/^\+/, "")

  // Paso 1: subir el archivo a la Media API de WhatsApp
  const uploadForm = new FormData()
  uploadForm.append("messaging_product", "whatsapp")
  uploadForm.append("file", file, file.name ?? "file")

  let uploadData
  try {
    const uploadRes = await fetch(
      `https://graph.facebook.com/${version}/${phoneNumberId}/media`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    uploadForm,
      }
    )
    uploadData = await uploadRes.json().catch(() => null)

    if (!uploadRes.ok) {
      console.error("[send-media-whatsapp] Error subiendo archivo:", uploadData)
      return Response.json(
        { error: uploadData?.error?.message || "Error al subir archivo", meta: uploadData?.error },
        { status: uploadRes.status }
      )
    }
  } catch (e) {
    console.error("[send-media-whatsapp] Error de red al subir archivo:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }

  const mediaId = uploadData?.id
  if (!mediaId) {
    return Response.json({ error: "La API no devolvió un media_id" }, { status: 500 })
  }

  // Paso 2: construir el objeto de media según el tipo
  const mediaObj = { id: mediaId }

  if (String(caption).trim()) {
    // caption aplica a image, document y video
    if (["image", "document", "video"].includes(String(mediaType))) {
      mediaObj.caption = String(caption).trim()
    }
  }

  if (String(mediaType) === "document") {
    mediaObj.filename = file.name ?? "documento"
  }

  // Paso 3: enviar el mensaje con el media
  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to,
    type:              String(mediaType),
    [String(mediaType)]: mediaObj,
  }

  let sendData
  try {
    const sendRes = await fetch(
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
    sendData = await sendRes.json().catch(() => null)

    if (!sendRes.ok) {
      console.error("[send-media-whatsapp] Error enviando mensaje:", sendData)
      return Response.json(
        { error: sendData?.error?.message || "Error al enviar mensaje", meta: sendData?.error },
        { status: sendRes.status }
      )
    }
  } catch (e) {
    console.error("[send-media-whatsapp] Error de red al enviar mensaje:", e)
    return Response.json({ error: e.message }, { status: 500 })
  }

  return Response.json({
    ok:         true,
    media_id:   mediaId,
    message_id: sendData?.messages?.[0]?.id ?? null,
  })
}

import { NextResponse } from "next/server"

export async function POST(request) {
  try {
    const body = await request.json()
    const { platform } = body

    if (platform === "admintour") {
      return await testAdmintour(body)
    }

    // Default: Dentalink
    return await testDentalink(body)
  } catch (err) {
    console.error("[integrations/test]", err)
    return NextResponse.json(
      { ok: false, message: "No se pudo conectar. Verifica la URL y las credenciales." },
      { status: 500 }
    )
  }
}

async function testDentalink({ api_token, api_url }) {
  if (!api_token) {
    return NextResponse.json({ ok: false, message: "El token de API es requerido." }, { status: 400 })
  }

  const baseUrl = (api_url || "https://api.dentalink.healthatom.com/api/v1").replace(/\/$/, "")

  const res = await fetch(`${baseUrl}/configuraciones`, {
    method: "GET",
    headers: { Authorization: `Token ${api_token}`, Accept: "application/json" },
  })

  if (res.ok) return NextResponse.json({ ok: true, message: "Conexión exitosa con Dentalink." })
  if (res.status === 401 || res.status === 403)
    return NextResponse.json({ ok: false, message: "Token inválido o sin permisos." })
  if (res.status === 404)
    return NextResponse.json({ ok: false, message: "URL no encontrada. Verifica la URL base." })

  return NextResponse.json({ ok: false, message: `Error HTTP ${res.status} al conectar con Dentalink.` })
}

async function testAdmintour({ base_url, api_key, hotcod, servicio = "MOTOREXTERNO" }) {
  if (!api_key)  return NextResponse.json({ ok: false, message: "La API Key es requerida." }, { status: 400 })
  if (!base_url) return NextResponse.json({ ok: false, message: "La URL base es requerida." }, { status: 400 })
  if (!hotcod)   return NextResponse.json({ ok: false, message: "El código de hotel (hotcod) es requerido." }, { status: 400 })

  const baseUrl = base_url.replace(/\/$/, "")

  // Usamos una fecha arbitraria para probar que el endpoint responde
  const hoy = new Date()
  const mm  = String(hoy.getMonth() + 1).padStart(2, "0")
  const dd  = String(hoy.getDate()).padStart(2, "0")
  const yyyy = hoy.getFullYear()
  const fecha = `${mm}-${dd}-${yyyy}`

  const qs = new URLSearchParams({
    hotcod,
    Servicio: servicio,
    tipohab:  "MAT",
    desdefecha: fecha,
    hastafecha: fecha,
  })

  const res = await fetch(`${baseUrl}/Externo_DisponibilidadHab?${qs}`, {
    method: "GET",
    headers: { "x-api-key": api_key, Accept: "application/json" },
  })

  if (res.ok) return NextResponse.json({ ok: true, message: "Conexión exitosa con Admintour." })
  if (res.status === 401 || res.status === 403)
    return NextResponse.json({ ok: false, message: "API Key inválida o sin permisos." })
  if (res.status === 404)
    return NextResponse.json({ ok: false, message: "URL no encontrada. Verifica la URL base." })

  return NextResponse.json({ ok: false, message: `Error HTTP ${res.status} al conectar con Admintour.` })
}

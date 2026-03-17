import { NextResponse } from "next/server"

const DEFAULT_API_URL = "https://api.dentalink.healthatom.com/api/v1"

export async function POST(request) {
  try {
    const { api_token, api_url } = await request.json()

    if (!api_token) {
      return NextResponse.json({ ok: false, message: "El token de API es requerido" }, { status: 400 })
    }

    const baseUrl = (api_url || DEFAULT_API_URL).replace(/\/$/, "")

    const res = await fetch(`${baseUrl}/configuraciones`, {
      method: "GET",
      headers: {
        Authorization: `Token ${api_token}`,
        Accept: "application/json",
      },
    })

    if (res.ok) {
      return NextResponse.json({
        ok: true,
        message: "Conexión exitosa con Dentalink.",
      })
    }

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        ok: false,
        message: "Token inválido o sin permisos. Verifica el token en Dentalink → Configuración → API.",
      })
    }

    if (res.status === 404) {
      return NextResponse.json({
        ok: false,
        message: "URL de API no encontrada. Verifica que la URL base sea correcta.",
      })
    }

    return NextResponse.json({
      ok: false,
      message: `Error al conectar con Dentalink (código ${res.status}). Intenta nuevamente.`,
    })
  } catch (err) {
    console.error("[integrations/test]", err)
    return NextResponse.json(
      { ok: false, message: "No se pudo conectar con Dentalink. Verifica la URL y el token." },
      { status: 500 }
    )
  }
}

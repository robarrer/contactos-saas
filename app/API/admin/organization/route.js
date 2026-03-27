import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

async function getOrgId() {
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return null
  const supabase = getServiceClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle()
  return profile?.organization_id ?? null
}

function mask(val) {
  if (!val) return ""
  if (val.length <= 8) return "••••••••"
  return val.slice(0, 4) + "•".repeat(Math.min(val.length - 8, 24)) + val.slice(-4)
}

// ─── GET: leer credenciales de la organización (tokens enmascarados) ──────────

export async function GET() {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const supabase = getServiceClient()
  const { data: org, error } = await supabase
    .from("organizations")
    .select("whatsapp_token, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_verify_token, whatsapp_app_secret, openai_api_key, anthropic_api_key")
    .eq("id", orgId)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!org)  return Response.json({ error: "Organización no encontrada" }, { status: 404 })

  return Response.json({
    org: {
      whatsapp_token:               mask(org.whatsapp_token),
      whatsapp_phone_number_id:     org.whatsapp_phone_number_id     ?? "",
      whatsapp_business_account_id: org.whatsapp_business_account_id ?? "",
      whatsapp_verify_token:        mask(org.whatsapp_verify_token),
      whatsapp_app_secret:          mask(org.whatsapp_app_secret),
      has_token:        !!org.whatsapp_token,
      has_verify_token: !!org.whatsapp_verify_token,
      has_app_secret:   !!org.whatsapp_app_secret,
      openai_api_key:   mask(org.openai_api_key),
      anthropic_api_key: mask(org.anthropic_api_key),
      has_openai_key:   !!org.openai_api_key,
      has_anthropic_key: !!org.anthropic_api_key,
    },
  })
}

// ─── PUT: actualizar credenciales (solo los campos no vacíos) ─────────────────

export async function PUT(req) {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body)  return Response.json({ error: "Body inválido" }, { status: 400 })

  const ALLOWED = [
    "whatsapp_token",
    "whatsapp_phone_number_id",
    "whatsapp_business_account_id",
    "whatsapp_verify_token",
    "whatsapp_app_secret",
    "openai_api_key",
    "anthropic_api_key",
  ]

  const updates = {}
  for (const key of ALLOWED) {
    const val = body[key]
    if (typeof val === "string" && val.trim() !== "") {
      updates[key] = val.trim()
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No hay campos para actualizar." }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from("organizations")
    .update(updates)
    .eq("id", orgId)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true, updated: Object.keys(updates) })
}

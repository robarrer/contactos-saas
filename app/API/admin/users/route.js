import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// Obtener la organización del usuario autenticado
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

// ─── GET: listar usuarios de la organización ──────────────────────────────────
export async function GET() {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const supabase = getServiceClient()

  // Obtener perfiles de la organización
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id")
    .eq("organization_id", orgId)
    .order("full_name")

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Obtener emails desde auth.users para los ids encontrados
  const ids = (profiles ?? []).map((p) => p.id)
  const emailMap = {}

  if (ids.length > 0) {
    const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    for (const u of authData?.users ?? []) {
      if (ids.includes(u.id)) emailMap[u.id] = u.email
    }
  }

  const users = (profiles ?? []).map((p) => ({
    id:        p.id,
    full_name: p.full_name ?? "",
    role:      p.role ?? "agent",
    email:     emailMap[p.id] ?? "",
  }))

  return Response.json({ users })
}

// ─── POST: crear nuevo usuario ────────────────────────────────────────────────
export async function POST(req) {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { email, password, full_name, role } = body ?? {}

  if (!email || !password) {
    return Response.json({ error: "Email y contraseña son obligatorios" }, { status: 400 })
  }
  if (password.length < 6) {
    return Response.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 })
  }

  const supabase = getServiceClient()

  // Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) return Response.json({ error: authError.message }, { status: 400 })

  const userId = authData.user.id

  // Crear perfil vinculado a la organización
  const { error: profileError } = await supabase.from("profiles").insert({
    id:              userId,
    organization_id: orgId,
    full_name:       full_name?.trim() || null,
    role:            role || "admin",
  })

  if (profileError) {
    // Rollback: eliminar el usuario de auth si falla el perfil
    await supabase.auth.admin.deleteUser(userId)
    return Response.json({ error: profileError.message }, { status: 500 })
  }

  return Response.json({
    user: { id: userId, email, full_name: full_name ?? "", role: role ?? "admin" }
  })
}

// ─── PUT: actualizar usuario ──────────────────────────────────────────────────
export async function PUT(req) {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { id, full_name, role, password } = body ?? {}

  if (!id) return Response.json({ error: "Falta id" }, { status: 400 })

  const supabase = getServiceClient()

  // Verificar que el usuario pertenece a esta organización
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle()

  if (!profile) return Response.json({ error: "Usuario no encontrado" }, { status: 404 })

  // Actualizar perfil
  await supabase.from("profiles").update({
    full_name: full_name?.trim() ?? null,
    role:      role ?? "admin",
  }).eq("id", id)

  // Cambiar contraseña si se proporcionó
  if (password && password.length >= 6) {
    await supabase.auth.admin.updateUserById(id, { password })
  }

  return Response.json({ ok: true })
}

// ─── DELETE: eliminar usuario ─────────────────────────────────────────────────
export async function DELETE(req) {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { id } = body ?? {}

  if (!id) return Response.json({ error: "Falta id" }, { status: 400 })

  const supabase = getServiceClient()

  // Verificar que pertenece a esta organización
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle()

  if (!profile) return Response.json({ error: "Usuario no encontrado" }, { status: 404 })

  // Eliminar de auth (el perfil se elimina en cascada por ON DELETE CASCADE)
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

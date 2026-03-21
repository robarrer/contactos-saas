import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ─── GET: listar bases de conocimiento CSV de un agente ───────────────────────
export async function GET(request) {
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const agent_id = searchParams.get("agent_id")
  if (!agent_id) return Response.json({ error: "agent_id requerido" }, { status: 400 })

  // Verificar acceso al agente usando la sesión del usuario (respeta RLS de agents)
  const { data: agent } = await serverClient
    .from("agents")
    .select("id")
    .eq("id", agent_id)
    .maybeSingle()

  if (!agent) {
    return Response.json({ error: "Agente no encontrado o sin permisos" }, { status: 403 })
  }

  // Leer usando service role para bypassear la RLS rota de agent_csv_knowledge
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from("agent_csv_knowledge")
    .select("id, name, search_column, headers, row_count, created_at")
    .eq("agent_id", agent_id)
    .order("created_at", { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data })
}

// ─── POST: crear nueva base de conocimiento CSV ───────────────────────────────
export async function POST(request) {
  // Verificar autenticación con la sesión del usuario
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 })

  const body = await request.json()
  const { agent_id, name, search_column, headers, rows, row_count } = body

  if (!agent_id || !name || !search_column) {
    return Response.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }

  // Verificar acceso al agente usando la sesión del usuario (respeta RLS de agents)
  const { data: agent } = await serverClient
    .from("agents")
    .select("id")
    .eq("id", agent_id)
    .maybeSingle()

  if (!agent) {
    return Response.json({ error: "Agente no encontrado o sin permisos" }, { status: 403 })
  }

  // Insertar usando service role para bypassear la RLS rota de agent_csv_knowledge
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from("agent_csv_knowledge")
    .insert({ agent_id, name, search_column, headers, rows, row_count })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data })
}

// ─── DELETE: eliminar base de conocimiento CSV ────────────────────────────────
export async function DELETE(request) {
  // Verificar autenticación con la sesión del usuario
  const serverClient = await createSupabaseServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) return Response.json({ error: "ID requerido" }, { status: 400 })

  // Verificar acceso al registro usando la sesión del usuario (respeta RLS de agent_csv_knowledge)
  const { data: kb } = await serverClient
    .from("agent_csv_knowledge")
    .select("id, agent_id")
    .eq("id", id)
    .maybeSingle()

  if (!kb) {
    return Response.json({ error: "Registro no encontrado o sin permisos" }, { status: 403 })
  }

  // Eliminar usando service role para bypassear la RLS rota
  const supabase = getServiceClient()
  const { error } = await supabase
    .from("agent_csv_knowledge")
    .delete()
    .eq("id", id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}

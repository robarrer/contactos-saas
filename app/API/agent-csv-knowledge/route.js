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
    .select("id, name, mode, search_column, headers, row_count, created_at")
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
  const { agent_id, name, mode, search_column, headers, rows, row_count } = body

  // En modo 'catalog' search_column es opcional; en 'exact' es requerido
  const effectiveMode = mode === "catalog" ? "catalog" : "exact"
  if (!agent_id || !name) {
    return Response.json({ error: "Faltan campos requeridos" }, { status: 400 })
  }
  if (effectiveMode === "exact" && !search_column) {
    return Response.json({ error: "search_column es requerido en modo exact" }, { status: 400 })
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
    .insert({ agent_id, name, mode: effectiveMode, search_column: search_column || null, headers, rows, row_count })
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

  // Leer el KB con service role (RLS de agent_csv_knowledge está rota)
  const supabase = getServiceClient()
  const { data: kb } = await supabase
    .from("agent_csv_knowledge")
    .select("id, agent_id")
    .eq("id", id)
    .maybeSingle()

  if (!kb) {
    return Response.json({ error: "Registro no encontrado" }, { status: 404 })
  }

  // Verificar que el agente pertenece al usuario usando la sesión (respeta RLS de agents)
  const { data: agent } = await serverClient
    .from("agents")
    .select("id")
    .eq("id", kb.agent_id)
    .maybeSingle()

  if (!agent) {
    return Response.json({ error: "Sin permisos para eliminar este registro" }, { status: 403 })
  }

  // Eliminar usando service role para bypassear la RLS rota
  const { error } = await supabase
    .from("agent_csv_knowledge")
    .delete()
    .eq("id", id)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}

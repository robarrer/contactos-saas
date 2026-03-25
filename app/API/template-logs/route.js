import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET(req) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) {
      return Response.json({ error: "No autenticado" }, { status: 401 })
    }

    const supabase = getServiceClient()
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()

    const orgId = profile?.organization_id
    if (!orgId) {
      return Response.json({ error: "Sin organización" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page           = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10))
    const limit          = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)))
    const statusFilter   = searchParams.get("status")   ?? ""
    const templateFilter = searchParams.get("template") ?? ""
    const contactFilter  = searchParams.get("contact")  ?? ""
    const offset         = (page - 1) * limit

    // Si hay filtro de contacto: resolver conversation_ids antes de la query principal.
    // Supabase no soporta filtrar en tablas anidadas (messages→conversations→contacts),
    // así que resolvemos los IDs en dos pasos.
    let conversationIdFilter = null
    if (contactFilter) {
      const q = `%${contactFilter}%`

      const { data: matchingContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", orgId)
        .or(`phone.ilike.${q},first_name.ilike.${q},last_name.ilike.${q}`)

      if (!matchingContacts?.length) {
        return Response.json({ logs: [], total: 0, page, limit })
      }

      const contactIds = matchingContacts.map((c) => c.id)

      const { data: matchingConvs } = await supabase
        .from("conversations")
        .select("id")
        .in("contact_id", contactIds)
        .eq("organization_id", orgId)

      if (!matchingConvs?.length) {
        return Response.json({ logs: [], total: 0, page, limit })
      }

      conversationIdFilter = matchingConvs.map((c) => c.id)
    }

    // Consulta principal: messages de tipo template outbound
    let query = supabase
      .from("messages")
      .select(
        `id, created_at, status, sender_name, content, wa_message_id,
         conversations(
           contacts(phone, first_name, last_name)
         )`,
        { count: "exact" }
      )
      .eq("content_type", "template")
      .eq("direction",    "outbound")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (statusFilter)            query = query.eq("status", statusFilter)
    if (templateFilter)          query = query.ilike("sender_name", `%${templateFilter}%`)
    if (conversationIdFilter)    query = query.in("conversation_id", conversationIdFilter)

    const { data, error, count } = await query

    if (error) {
      console.error("[template-logs] Error en query:", error.message)
      return Response.json({ error: error.message }, { status: 500 })
    }

    const logs = (data ?? []).map((m) => {
      const contact      = m.conversations?.contacts
      const templateName = m.sender_name?.replace(/^template:/, "") ?? "—"
      return {
        id:            m.id,
        created_at:    m.created_at,
        status:        m.status ?? "sent",
        template_name: templateName,
        content:       m.content,
        wa_message_id: m.wa_message_id,
        contact_phone: contact?.phone ?? "—",
        contact_name:  [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || null,
      }
    })

    return Response.json({ logs, total: count ?? 0, page, limit })
  } catch (err) {
    console.error("[template-logs] Error:", err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

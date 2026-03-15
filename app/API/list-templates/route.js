import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/app/lib/supabase-server"

/**
 * GET /API/list-templates
 * Lista las plantillas de WhatsApp de la organización del usuario autenticado.
 */
export async function GET(req) {
  let token  = process.env.WHATSAPP_TOKEN
  let wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const version = process.env.META_GRAPH_VERSION || "v22.0"

  // Intentar leer credenciales de la organización del usuario autenticado
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (user) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      )
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle()

      if (profile?.organization_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("whatsapp_token, whatsapp_business_account_id")
          .eq("id", profile.organization_id)
          .maybeSingle()
        if (org?.whatsapp_token)               token  = org.whatsapp_token
        if (org?.whatsapp_business_account_id) wabaId = org.whatsapp_business_account_id
      }
    }
  } catch {
    // Sin sesión — usar env vars
  }

  if (!token || !wabaId) {
    return Response.json(
      { error: "Faltan credenciales de WhatsApp para esta organización." },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || "APPROVED"
  const limit  = Math.min(parseInt(searchParams.get("limit"), 10) || 50, 100)

  const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/message_templates`)
  url.searchParams.set("limit", String(limit))
  if (status) url.searchParams.set("status", status)
  url.searchParams.set("fields", "name,status,category,language,components")

  try {
    const response = await fetch(url.toString(), {
      method:  "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return Response.json(
        { error: data?.error?.message || "Error al obtener plantillas de Meta", meta: data?.error },
        { status: response.status }
      )
    }

    return Response.json({ templates: data?.data ?? [], paging: data?.paging ?? null })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

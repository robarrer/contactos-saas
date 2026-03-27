import { createSupabaseServerClient } from "@/app/lib/supabase-server"
import { createClient } from "@supabase/supabase-js"

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

export async function GET(req) {
  const orgId = await getOrgId()
  if (!orgId) return Response.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10), 1), 90)

  const supabase = getServiceClient()

  // ── Intento 1: función SQL agregada (get_metrics) ─────────────────────────
  // Ejecuta todos los cálculos en PostgreSQL y devuelve ~30-90 filas en lugar
  // de descargar potencialmente miles de filas de conversations y messages.
  // Si la función aún no existe en Supabase (PGRST202), caemos al método legacy.
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_metrics", {
    p_org_id: orgId,
    p_days:   days,
  })

  if (!rpcError && rpcData) {
    // La función devuelve JSON con la misma forma que el método legacy.
    const payload = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData

    // Convertir bySender de objeto {contact, bot, agent} al array que espera el frontend.
    const senderObj = payload.charts?.bySender ?? {}
    const bySender = [
      { type: "Contacto", count: senderObj.contact ?? 0 },
      { type: "Bot",      count: senderObj.bot     ?? 0 },
      { type: "Agente",   count: senderObj.agent   ?? 0 },
    ]

    return Response.json(
      { period: days, kpis: payload.kpis, charts: { ...payload.charts, bySender } },
      { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } }
    )
  }

  // Si el error no es "función no encontrada", lo propagamos.
  if (rpcError && rpcError.code !== "PGRST202") {
    console.error("[metrics] RPC error:", rpcError.message)
    return Response.json({ error: rpcError.message }, { status: 500 })
  }

  // ── Fallback legacy: descarga de filas + procesamiento en JS ──────────────
  // Se activa automáticamente mientras la función get_metrics no exista en Supabase.
  // Una vez que ejecutes supabase/migrations/get_metrics.sql este bloque ya no se usa.
  console.warn("[metrics] get_metrics RPC no encontrada; usando método legacy (descarga de filas)")

  const since    = new Date()
  since.setDate(since.getDate() - days)
  const sinceIso = since.toISOString()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayIso = today.toISOString()

  const [convResult, msgResult, contactResult, openConvResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("created_at, status, mode, channel")
      .eq("organization_id", orgId)
      .gte("created_at", sinceIso),
    supabase
      .from("messages")
      .select("created_at, direction, sender_type")
      .eq("organization_id", orgId)
      .gte("created_at", sinceIso),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", sinceIso),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "open"),
  ])

  const convs          = convResult.data    ?? []
  const msgs           = msgResult.data     ?? []
  const contactsPeriod = contactResult.count ?? 0
  const openConvs      = openConvResult.count ?? 0

  const convsToday        = convs.filter(c => c.created_at >= todayIso).length
  const botConvs          = convs.filter(c => c.mode === "bot").length
  const agentConvs        = convs.filter(c => c.mode === "agent").length
  const closedConvsPeriod = convs.filter(c => c.status === "closed").length
  const msgsPerConv       = convs.length > 0
    ? Math.round((msgs.length / convs.length) * 10) / 10
    : 0

  const dateMap = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dateMap[key] = { date: key, convs: 0, inbound: 0, outbound: 0 }
  }
  for (const c of convs) {
    const key = c.created_at.slice(0, 10)
    if (dateMap[key]) dateMap[key].convs++
  }
  for (const m of msgs) {
    const key = m.created_at.slice(0, 10)
    if (dateMap[key]) {
      if (m.direction === "inbound") dateMap[key].inbound++
      else dateMap[key].outbound++
    }
  }

  const channelMap = {}
  for (const c of convs) {
    const ch = c.channel || "whatsapp"
    channelMap[ch] = (channelMap[ch] || 0) + 1
  }

  const senderMap = { contact: 0, bot: 0, agent: 0 }
  for (const m of msgs) {
    const st = m.sender_type
    if (st in senderMap) senderMap[st]++
  }

  return Response.json(
    {
      period: days,
      kpis: {
        convsToday,
        convsPeriod:        convs.length,
        closedConvsPeriod,
        msgsPeriod:         msgs.length,
        contactsPeriod,
        openConvs,
        botConvs,
        agentConvs,
        msgsPerConv,
      },
      charts: {
        byDay: Object.values(dateMap),
        byChannel: Object.entries(channelMap)
          .sort((a, b) => b[1] - a[1])
          .map(([channel, count]) => ({ channel, count })),
        bySender: [
          { type: "Contacto", count: senderMap.contact },
          { type: "Bot",      count: senderMap.bot },
          { type: "Agente",   count: senderMap.agent },
        ],
      },
    },
    { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } }
  )
}

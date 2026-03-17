/**
 * GET /API/diagnostico
 * Endpoint de diagnóstico para verificar la configuración de WhatsApp.
 * SOLO PARA DESARROLLO — eliminar o proteger antes de producción.
 */
import { createClient } from "@supabase/supabase-js"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function GET() {
  const supabase = getServiceClient()
  const results  = {}

  // ── 1. Variables de entorno ────────────────────────────────────────────────
  results.env = {
    WHATSAPP_TOKEN:              !!process.env.WHATSAPP_TOKEN,
    WHATSAPP_TOKEN_PREVIEW:      (process.env.WHATSAPP_TOKEN ?? "").slice(0, 20) + "…",
    WHATSAPP_PHONE_NUMBER_ID:    process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? null,
    WHATSAPP_APP_SECRET:         !!process.env.WHATSAPP_APP_SECRET,
    SUPABASE_URL:                process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    SUPABASE_SERVICE_ROLE_KEY:   !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_URL:         process.env.NEXT_PUBLIC_APP_URL ?? null,
  }

  // ── 2. Organizaciones en la BD ─────────────────────────────────────────────
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, whatsapp_phone_number_id, whatsapp_verify_token, whatsapp_token")

  results.organizations = orgsError
    ? { error: orgsError.message }
    : (orgs ?? []).map((o) => ({
        id:                       o.id,
        name:                     o.name,
        whatsapp_phone_number_id: o.whatsapp_phone_number_id ?? null,
        whatsapp_verify_token:    o.whatsapp_verify_token ?? null,
        whatsapp_token_set:       !!o.whatsapp_token,
        phone_number_id_matches_env:
          o.whatsapp_phone_number_id === process.env.WHATSAPP_PHONE_NUMBER_ID,
      }))

  // ── 3. Últimos eventos del webhook ─────────────────────────────────────────
  const { data: events, error: eventsError } = await supabase
    .from("webhook_events")
    .select("id, event_type, organization_id, processed, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(5)

  results.recent_webhook_events = eventsError
    ? { error: eventsError.message }
    : (events ?? []).map((e) => ({
        id:              e.id,
        event_type:      e.event_type,
        organization_id: e.organization_id,
        processed:       e.processed,
        created_at:      e.created_at,
        phone_number_id: e.payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null,
        has_messages:    !!(e.payload?.entry?.[0]?.changes?.[0]?.value?.messages?.length),
      }))

  // ── 4. Últimas conversaciones ──────────────────────────────────────────────
  const { data: convs, error: convsError } = await supabase
    .from("conversations")
    .select("id, channel, status, organization_id, last_message, last_activity, created_at")
    .order("created_at", { ascending: false })
    .limit(5)

  results.recent_conversations = convsError
    ? { error: convsError.message }
    : convs ?? []

  // ── 5. Últimos mensajes ────────────────────────────────────────────────────
  const { data: msgs, error: msgsError } = await supabase
    .from("messages")
    .select("id, conversation_id, direction, sender_type, content_type, content, status, created_at, organization_id")
    .order("created_at", { ascending: false })
    .limit(5)

  results.recent_messages = msgsError
    ? { error: msgsError.message }
    : msgs ?? []

  // ── 6. Perfiles de usuario ─────────────────────────────────────────────────
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, role, organization_id")
    .limit(10)

  results.profiles = profilesError
    ? { error: profilesError.message }
    : profiles ?? []

  // ── 7. Verificar token de WhatsApp contra Meta ─────────────────────────────
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const version = process.env.META_GRAPH_VERSION || "v23.0"

  if (token && phoneId) {
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/${version}/${phoneId}?fields=display_phone_number,verified_name&access_token=${token}`,
        { signal: AbortSignal.timeout(8000) }
      )
      const metaData = await metaRes.json().catch(() => null)
      results.meta_token_check = {
        status:               metaRes.status,
        ok:                   metaRes.ok,
        display_phone_number: metaData?.display_phone_number ?? null,
        verified_name:        metaData?.verified_name ?? null,
        error:                metaData?.error?.message ?? null,
      }
    } catch (e) {
      results.meta_token_check = { error: e.message }
    }
  } else {
    results.meta_token_check = { skipped: "Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID" }
  }

  // ── 8. Diagnóstico final ───────────────────────────────────────────────────
  const issues = []

  if (!process.env.WHATSAPP_TOKEN)
    issues.push("❌ WHATSAPP_TOKEN no está definido")

  if (!process.env.WHATSAPP_PHONE_NUMBER_ID)
    issues.push("❌ WHATSAPP_PHONE_NUMBER_ID no está definido")

  if (!process.env.WHATSAPP_APP_SECRET)
    issues.push("⚠️  WHATSAPP_APP_SECRET no está definido — la verificación HMAC del webhook está desactivada")

  const noPhoneIdOrgs = (orgs ?? []).filter((o) => !o.whatsapp_phone_number_id)
  if (noPhoneIdOrgs.length > 0)
    issues.push(`⚠️  ${noPhoneIdOrgs.length} organización(es) sin whatsapp_phone_number_id: ${noPhoneIdOrgs.map((o) => o.name || o.id).join(", ")}`)

  const profilesWithoutOrg = (profiles ?? []).filter((p) => !p.organization_id)
  if (profilesWithoutOrg.length > 0)
    issues.push(`⚠️  ${profilesWithoutOrg.length} perfil(es) sin organization_id — no verán conversaciones en el inbox`)

  const convsWithoutOrg = (convs ?? []).filter((c) => !c.organization_id)
  if (convsWithoutOrg.length > 0)
    issues.push(`⚠️  ${convsWithoutOrg.length} conversaciones recientes sin organization_id`)

  if (results.meta_token_check?.error)
    issues.push(`❌ Token de Meta inválido: ${results.meta_token_check.error}`)

  results.issues = issues.length > 0 ? issues : ["✅ Sin problemas detectados automáticamente"]

  return Response.json(results, { status: 200 })
}

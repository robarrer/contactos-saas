import { NextResponse } from "next/server"
import { createServiceClient } from "@/app/lib/supabase-server"

/**
 * Cron job ejecutado por Vercel para sincronizaciones programadas.
 * Vercel llama con header Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: integrations, error } = await serviceClient
    .from("agent_integrations")
    .select("id, platform, config, enabled, agent_id")
    .eq("platform", "dentalink")
    .eq("enabled", true)

  if (error || !integrations?.length) {
    return NextResponse.json({ ok: true, message: "No hay integraciones para sincronizar", synced: 0 })
  }

  const now = Date.now()
  const FREQ_MS = {
    hourly: 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
  }

  let synced = 0
  const results = []

  for (const integration of integrations) {
    const freq = integration.config?.sync_frequency
    const syncEnabled = integration.config?.sync_contacts
    if (!syncEnabled || !freq || freq === "manual") continue

    const lastSync = integration.config?.last_sync_at
      ? new Date(integration.config.last_sync_at).getTime()
      : 0
    const interval = FREQ_MS[freq]
    if (!interval || now - lastSync < interval) continue

    try {
      const baseUrl = getBaseUrl()
      const res = await fetch(`${baseUrl}/API/integrations/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({ integration_id: integration.id }),
      })
      const json = await res.json()
      results.push({ id: integration.id, ...json })
      if (json.ok) synced++
    } catch (err) {
      console.error("[cron] Error sincronizando integración", integration.id, err)
      results.push({ id: integration.id, ok: false, error: String(err) })
    }
  }

  console.log(`[cron] Sync completado — ${synced}/${integrations.length} integraciones sincronizadas`)
  return NextResponse.json({ ok: true, synced, results })
}

function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

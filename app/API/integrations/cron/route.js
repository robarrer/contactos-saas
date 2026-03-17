import { NextResponse } from "next/server"
import { createServiceClient } from "@/app/lib/supabase-server"

/**
 * Cron job ejecutado por Vercel para sincronizaciones programadas.
 * Vercel llama a este endpoint con el header Authorization: Bearer <CRON_SECRET>.
 * Configurar CRON_SECRET en las variables de entorno de Vercel.
 */
export async function GET(request) {
  // Validar cron secret para evitar ejecuciones no autorizadas
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  // Obtener todas las integraciones de Dentalink con sync habilitado
  const { data: integrations, error } = await serviceClient
    .from("integrations")
    .select("*")
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

    // Llamar al endpoint de sync
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      const res = await fetch(`${appUrl}/API/integrations/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

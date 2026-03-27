import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

function getBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL)                   return `https://${process.env.VERCEL_URL}`
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
}

/**
 * GET /API/followups/cron
 *
 * Ejecutado por Vercel Cron cada 15 minutos.
 * Para cada conversación en modo bot activa:
 *   1. Busca el agente asignado a su etapa del pipeline.
 *   2. Revisa los followups configurados.
 *   3. Si alguno es debido (tiempo >= delay desde last_bot_at) y no fue enviado aún,
 *      llama a agent-reply para generar y enviar el mensaje de seguimiento.
 */
export async function GET(request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase  = getServiceClient()
  const baseUrl   = getBaseUrl()
  const now       = new Date()
  const window24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Conversaciones abiertas en modo bot con al menos un mensaje del bot en las últimas 24h
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, mode, pipeline_stage, organization_id, wa_contact_id, last_bot_at, last_inbound_at, followup_sent")
    .eq("status", "open")
    .eq("mode", "bot")
    .not("last_bot_at", "is", null)
    .gte("last_bot_at", window24h)

  if (error) {
    console.error("[followups/cron] Error cargando conversaciones:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!conversations?.length) {
    console.log("[followups/cron] Sin conversaciones con last_bot_at en las últimas 24h")
    return NextResponse.json({ ok: true, processed: 0, message: "Sin conversaciones pendientes" })
  }

  console.log(`[followups/cron] Procesando ${conversations.length} conversación(es) candidata(s)`)

  let triggered = 0
  let skipped   = 0
  const results  = []

  for (const conv of conversations) {
    // Si el contacto respondió después del último bot message, no hay seguimiento pendiente
    if (conv.last_inbound_at && conv.last_inbound_at >= conv.last_bot_at) {
      console.log(`[followups/cron] Conv=${conv.id} saltada — el contacto respondió después del bot (last_inbound_at=${conv.last_inbound_at} >= last_bot_at=${conv.last_bot_at})`)
      skipped++
      continue
    }

    const lastBotAt     = new Date(conv.last_bot_at)
    const elapsedMin    = (now.getTime() - lastBotAt.getTime()) / 60000
    const followupSent  = Array.isArray(conv.followup_sent) ? conv.followup_sent : []

    console.log(`[followups/cron] Conv=${conv.id} stage="${conv.pipeline_stage}" elapsed=${Math.round(elapsedMin)}min followup_sent=${JSON.stringify(followupSent)}`)

    // Buscar el agente de esta conversación (por etapa del pipeline)
    let agent = null

    if (conv.pipeline_stage) {
      let stageQuery = supabase
        .from("pipeline_stages")
        .select("agent_id")
        .eq("name", conv.pipeline_stage)
        .order("position", { ascending: true })
        .limit(1)
      if (conv.organization_id) stageQuery = stageQuery.eq("organization_id", conv.organization_id)
      const { data: stageRow } = await stageQuery.maybeSingle()

      if (stageRow?.agent_id) {
        const { data: stageAgent } = await supabase
          .from("agents")
          .select("id, name, followups")
          .eq("id", stageRow.agent_id)
          .eq("active", true)
          .maybeSingle()
        agent = stageAgent ?? null
      }

      if (!agent) {
        console.warn(`[followups/cron] Etapa "${conv.pipeline_stage}" sin agente activo en conv=${conv.id} — intentando fallback`)
      }
    }

    // Fallback: primer agente activo de la organización (mismo comportamiento que agent-reply)
    if (!agent && conv.organization_id) {
      const { data: fallbackAgent } = await supabase
        .from("agents")
        .select("id, name, followups")
        .eq("active", true)
        .eq("organization_id", conv.organization_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      agent = fallbackAgent ?? null
      if (agent) {
        console.log(`[followups/cron] Fallback → agente="${agent.name}" conv=${conv.id}`)
      }
    }

    if (!agent) {
      console.warn(`[followups/cron] Sin agente activo para conv=${conv.id} org=${conv.organization_id} stage="${conv.pipeline_stage}" — saltando`)
      skipped++
      continue
    }

    if (!agent.followups?.length) {
      console.log(`[followups/cron] Agente "${agent.name}" sin seguimientos configurados — conv=${conv.id} saltando`)
      skipped++
      continue
    }

    // Calcular tiempo acumulado de cada followup y verificar si es debido.
    // Los delays son ACUMULATIVOS desde el mensaje original del bot (last_bot_at),
    // no desde el último seguimiento enviado.
    let cumulativeMin = 0
    for (let i = 0; i < agent.followups.length; i++) {
      const fu = agent.followups[i]
      if (!fu.enabled) continue

      const delayMin = (fu.delay_hours || 0) * 60 + (fu.delay_minutes || 0)
      cumulativeMin += delayMin

      // Ya enviado en este ciclo
      if (followupSent.includes(i)) continue

      // Aún no es el momento (break: los siguientes tampoco lo serán, los delays son acumulativos)
      if (elapsedMin < cumulativeMin) {
        console.log(`[followups/cron] Seguimiento ${i + 1} aún no debido — conv=${conv.id} elapsed=${Math.round(elapsedMin)}min necesita=${cumulativeMin}min`)
        break
      }

      // Este followup es debido — disparar solo uno por ejecución del cron para no saturar
      console.log(`[followups/cron] Disparando followup ${i} conv=${conv.id} elapsed=${Math.round(elapsedMin)}min cumulative=${cumulativeMin}min objective="${fu.objective}"`)

      try {
        const res = await fetch(`${baseUrl}/API/agent-reply`, {
          method:  "POST",
          headers: {
            "Content-Type":    "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "",
          },
          body: JSON.stringify({
            conversation_id:   conv.id,
            message_text:      `[Seguimiento automático ${i + 1}]`,
            organization_id:   conv.organization_id,
            followup_objective: fu.objective,
            followup_index:    i,
          }),
          signal: AbortSignal.timeout(40000),
        })

        const data = await res.json().catch(() => null)

        if (res.ok && data?.action === "reply" && data?.text) {
          // Enviar el mensaje por WhatsApp directamente desde aquí
          const waId = conv.wa_contact_id
          let waToken         = process.env.WHATSAPP_TOKEN
          let waPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

          if (conv.organization_id) {
            const { data: org } = await supabase
              .from("organizations")
              .select("whatsapp_token, whatsapp_phone_number_id")
              .eq("id", conv.organization_id)
              .maybeSingle()
            if (org?.whatsapp_token)          waToken         = org.whatsapp_token
            if (org?.whatsapp_phone_number_id) waPhoneNumberId = org.whatsapp_phone_number_id
          }

          const version = process.env.META_GRAPH_VERSION || "v23.0"
          const waRes = await fetch(`https://graph.facebook.com/${version}/${waPhoneNumberId}/messages`, {
            method:  "POST",
            headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" },
            body:    JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type:    "individual",
              to:                waId,
              type:              "text",
              text:              { preview_url: false, body: data.text },
            }),
            signal: AbortSignal.timeout(10000),
          })

          const waData      = await waRes.json().catch(() => null)
          const waMessageId = waData?.messages?.[0]?.id ?? null
          const sentOk      = waRes.ok

          if (!sentOk) {
            console.error(`[followups/cron] ❌ WhatsApp error ${waRes.status}:`, JSON.stringify(waData))
          } else {
            console.log(`[followups/cron] ✅ Seguimiento ${i + 1} enviado a ${waId} conv=${conv.id}`)
          }

          // Registrar mensaje en DB
          const sentAt = new Date().toISOString()
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            organization_id: conv.organization_id ?? null,
            direction:       "outbound",
            sender_type:     "bot",
            sender_name:     data.agent_name ?? "Bot",
            content_type:    "text",
            content:         data.text,
            is_internal:     false,
            wa_message_id:   waMessageId,
            status:          sentOk ? "sent" : "failed",
          })

          // Marcar este followup como enviado.
          // NO actualizamos last_bot_at: debe mantenerse como el tiempo del mensaje
          // original del bot para que los delays acumulativos se calculen correctamente.
          // Si actualizáramos last_bot_at aquí, cada seguimiento resetearía el reloj
          // y los siguientes se retrasarían innecesariamente.
          const newSent = [...followupSent, i]
          await supabase
            .from("conversations")
            .update({
              last_message:  data.text,
              last_activity: sentAt,
              followup_sent: newSent,
            })
            .eq("id", conv.id)

          triggered++
          results.push({ conv_id: conv.id, followup: i + 1, ok: sentOk })
        } else {
          console.warn(`[followups/cron] agent-reply no generó reply para conv=${conv.id}: action=${data?.action} reason=${data?.reason ?? "-"}`)
          skipped++
        }
      } catch (err) {
        console.error(`[followups/cron] Error procesando conv=${conv.id}:`, err.message)
        results.push({ conv_id: conv.id, followup: i + 1, error: err.message })
      }

      // Solo disparar un followup por conversación por ejecución
      break
    }
  }

  console.log(`[followups/cron] Completado — triggered=${triggered} skipped=${skipped}`)
  return NextResponse.json({ ok: true, triggered, skipped, results })
}

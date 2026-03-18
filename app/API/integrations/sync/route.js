import { NextResponse } from "next/server"
import { createSupabaseServerClient, createServiceClient } from "@/app/lib/supabase-server"

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, message: "No autenticado" }, { status: 401 })
    }

    const { integration_id } = await request.json()
    if (!integration_id) {
      return NextResponse.json({ ok: false, message: "integration_id es requerido" }, { status: 400 })
    }

    // Usar cliente con sesión (RLS) para verificar que el usuario tiene acceso a esta integración
    const { data: integration, error: intErr } = await supabase
      .from("agent_integrations")
      .select("id, platform, config, agent_id")
      .eq("id", integration_id)
      .single()

    if (intErr || !integration) {
      return NextResponse.json({ ok: false, message: "Integración no encontrada" }, { status: 404 })
    }

    if (integration.platform !== "dentalink") {
      return NextResponse.json({ ok: false, message: "La sincronización solo está disponible para Dentalink." }, { status: 400 })
    }

    const { api_token, api_url } = integration.config ?? {}
    if (!api_token) {
      return NextResponse.json({ ok: false, message: "Token de API no configurado" }, { status: 400 })
    }

    // Obtener organization_id a través del agente
    const serviceClient = createServiceClient()
    const { data: agent } = await serviceClient
      .from("agents")
      .select("organization_id")
      .eq("id", integration.agent_id)
      .single()

    const orgId = agent?.organization_id
    if (!orgId) {
      return NextResponse.json({ ok: false, message: "La integración no tiene organización asignada." }, { status: 400 })
    }

    const baseUrl = (api_url || "https://api.dentalink.healthatom.com/api/v1").replace(/\/$/, "")

    const MAX_PATIENTS_PER_RUN = 400
    const allPatients = []
    let nextUrl = `${baseUrl}/pacientes`
    let pageNum = 0
    let retry429 = 0
    const MAX_RETRY_429 = 3

    while (nextUrl && allPatients.length < MAX_PATIENTS_PER_RUN) {
      if (pageNum > 0) await sleep(350)

      const res = await fetch(nextUrl, {
        headers: {
          Authorization: `Token ${api_token}`,
          Accept: "application/json",
        },
      })

      if (res.status === 429) {
        retry429++
        if (retry429 > MAX_RETRY_429) {
          return NextResponse.json(
            { ok: false, message: "Dentalink ha limitado las peticiones. Espera unos minutos e intenta de nuevo." },
            { status: 429 }
          )
        }
        const retryAfter = res.headers.get("Retry-After")
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 8000
        console.log(`[sync] Rate limit 429, esperando ${waitMs}ms (${retry429}/${MAX_RETRY_429})`)
        await sleep(waitMs)
        continue
      }

      retry429 = 0

      if (!res.ok) {
        const errText = await res.text()
        console.error("[sync] Dentalink error:", res.status, errText)
        return NextResponse.json(
          { ok: false, message: `Error al obtener pacientes de Dentalink (código ${res.status})` },
          { status: 502 }
        )
      }

      const json = await res.json()
      const patients = Array.isArray(json.data) ? json.data : []
      const remaining = MAX_PATIENTS_PER_RUN - allPatients.length
      allPatients.push(...patients.slice(0, remaining))

      nextUrl = json.links?.next && allPatients.length < MAX_PATIENTS_PER_RUN ? json.links.next : null
      pageNum++
    }

    const hasMore = allPatients.length >= MAX_PATIENTS_PER_RUN

    if (allPatients.length === 0) {
      return NextResponse.json({ ok: true, total: 0, created: 0, updated: 0, message: "No se encontraron pacientes en Dentalink." })
    }

    function normalizePhone(raw) {
      const s = String(raw ?? "").trim().replace(/\D/g, "")
      if (!s) return ""
      if (s.startsWith("56") && s.length >= 11) return "+" + s.slice(0, 11)
      if (s.startsWith("9") && s.length === 9) return "+56" + s
      if (s.length >= 9 && s.startsWith("9")) return "+56" + s.slice(0, 9)
      return ""
    }

    const contacts = allPatients.map((p) => {
      const rawPhone = (p.celular || p.telefono || "").toString().trim()
      const phone = normalizePhone(rawPhone) || rawPhone
      const emailRaw = (p.email || "").trim()
      return {
        first_name: (p.nombre || "").toString().trim(),
        last_name: (p.apellidos || "").toString().trim(),
        phone: phone || null,
        email: emailRaw || null,
        company: "",
        status: p.habilitado === 0 ? "inactive" : "active",
        organization_id: orgId,
      }
    })

    const existingByPhone = new Map()
    const existingByEmail = new Map()
    const { data: existing } = await serviceClient
      .from("contacts")
      .select("id, phone, email")
      .eq("organization_id", orgId)
      .limit(10000)

    for (const c of existing || []) {
      const p = c.phone?.trim()
      if (p) {
        existingByPhone.set(p, c.id)
        const norm = normalizePhone(p)
        if (norm && norm !== p) existingByPhone.set(norm, c.id)
      }
      const e = c.email?.trim()
      if (e) existingByEmail.set(e.toLowerCase(), c.id)
    }

    const toInsert = []
    const toUpdate = []
    const seenEmailInBatch = new Set()
    const seenPhoneInBatch = new Set()

    for (const contact of contacts) {
      const phoneNorm = contact.phone ? normalizePhone(contact.phone) : ""
      const existingId = contact.phone
        ? (existingByPhone.get(contact.phone) ?? existingByPhone.get(phoneNorm))
        : contact.email
        ? existingByEmail.get(contact.email.toLowerCase())
        : null

      if (existingId) {
        toUpdate.push({ id: existingId, ...contact })
      } else {
        const emailKey = contact.email?.toLowerCase() || null
        const phoneKey = contact.phone || null
        if (emailKey && seenEmailInBatch.has(emailKey)) continue
        if (phoneKey && seenPhoneInBatch.has(phoneKey)) continue
        if (emailKey) seenEmailInBatch.add(emailKey)
        if (phoneKey) seenPhoneInBatch.add(phoneKey)
        toInsert.push(contact)
      }
    }

    let created = 0
    let updated = 0
    let firstError = null

    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50)
      const { error } = await serviceClient.from("contacts").insert(batch)
      if (error) {
        if (!firstError) firstError = error.message
        console.error("[sync] Insert error:", error.message)
      } else {
        created += batch.length
      }
    }

    for (let i = 0; i < toUpdate.length; i += 20) {
      const batch = toUpdate.slice(i, i + 20)
      const results = await Promise.all(
        batch.map(({ id, ...rest }) =>
          serviceClient.from("contacts").update({ first_name: rest.first_name, last_name: rest.last_name, email: rest.email, status: rest.status }).eq("id", id)
        )
      )
      for (const r of results) {
        if (r.error) {
          if (!firstError) firstError = r.error.message
          console.error("[sync] Update error:", r.error.message)
        } else {
          updated++
        }
      }
    }

    if (firstError && created === 0 && updated === 0) {
      return NextResponse.json({ ok: false, message: `Error al guardar: ${firstError}` }, { status: 502 })
    }

    // Actualizar config con last_sync_at
    const updatedConfig = {
      ...integration.config,
      last_sync_at: new Date().toISOString(),
      last_sync_count: created + updated,
    }
    await serviceClient
      .from("agent_integrations")
      .update({ config: updatedConfig })
      .eq("id", integration_id)

    console.log(`[sync] Dentalink sync OK — org=${orgId} total=${allPatients.length} created=${created} updated=${updated}`)

    return NextResponse.json({
      ok: true,
      total: allPatients.length,
      created,
      updated,
      hasMore: hasMore ? "Hay más pacientes. Ejecuta sincronizar de nuevo para continuar." : null,
    })
  } catch (err) {
    console.error("[sync] Error:", err)
    return NextResponse.json({ ok: false, message: "Error interno durante la sincronización." }, { status: 500 })
  }
}

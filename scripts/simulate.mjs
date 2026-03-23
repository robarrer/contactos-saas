#!/usr/bin/env node
/**
 * simulate.js — Simulador de carga y pruebas de contactos-saas
 *
 * Simula el comportamiento real de Meta enviando webhooks firmados con HMAC.
 * Permite detectar problemas antes de que ocurran en producción.
 *
 * Uso:
 *   node scripts/simulate.js [modo] [opciones]
 *
 * Modos disponibles:
 *   single      → Un mensaje normal (flujo completo)
 *   burst       → 3 mensajes rápidos a la misma conversación (prueba debounce)
 *   concurrent  → N conversaciones simultáneas (prueba carga)
 *   duplicate   → Mismo message_id dos veces (prueba deduplicación)
 *   status      → Actualización de estado de entrega
 *   edge        → Casos borde: mensaje vacío, muy largo, caracteres especiales, imagen
 *   followups   → Dispara el cron de seguimientos manualmente
 *   all         → Ejecuta todos los modos en secuencia
 *
 * Opciones:
 *   --url=URL           URL base (default: http://localhost:3000)
 *   --count=N           Cantidad de conversaciones en modo concurrent (default: 5)
 *   --phone=NUMERO      Teléfono del contacto simulado (default: +5491100000001)
 *   --phone-number-id=ID  phone_number_id de la org (default: usa WHATSAPP_PHONE_NUMBER_ID del .env)
 *   --dry-run           Muestra los payloads sin enviarlos
 *   --verbose           Muestra los cuerpos de respuesta completos
 *
 * Ejemplos:
 *   node scripts/simulate.js single
 *   node scripts/simulate.js burst --url=https://mi-app.vercel.app
 *   node scripts/simulate.js concurrent --count=10
 *   node scripts/simulate.js all --verbose
 */

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// ─── Configuración ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

// Cargar .env.local si existe
function loadEnv() {
  const envPath = path.join(ROOT, ".env.local")
  if (!fs.existsSync(envPath)) {
    const examplePath = path.join(ROOT, ".env.example")
    console.warn(`${YELLOW}⚠  No se encontró .env.local — usando variables de entorno del sistema${RESET}`)
    if (fs.existsSync(examplePath)) {
      console.warn(`${YELLOW}   Copia .env.example a .env.local y configura tus valores.${RESET}`)
    }
    return
  }
  const raw = fs.readFileSync(envPath, "utf-8")
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}

// ─── Colores ANSI ──────────────────────────────────────────────────────────────

const RESET  = "\x1b[0m"
const BOLD   = "\x1b[1m"
const GREEN  = "\x1b[32m"
const RED    = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN   = "\x1b[36m"
const DIM    = "\x1b[2m"

// ─── Parseo de args CLI ────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = {
    mode: "single",
    url: "http://localhost:3000",
    count: 5,
    phone: "+5491100000001",
    phoneNumberId: null,
    dryRun: false,
    verbose: false,
  }
  for (const arg of args) {
    if (!arg.startsWith("--")) { opts.mode = arg; continue }
    const [k, v] = arg.slice(2).split("=")
    if (k === "url")             opts.url          = v
    if (k === "count")           opts.count        = parseInt(v) || 5
    if (k === "phone")           opts.phone        = v
    if (k === "phone-number-id") opts.phoneNumberId = v
    if (k === "dry-run")         opts.dryRun       = true
    if (k === "verbose")         opts.verbose      = true
  }
  return opts
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomBytes(8).toString("hex")
}

function waMessageId() {
  return `wamid.${Buffer.from(uid()).toString("base64")}`
}

function unixTs(offsetMs = 0) {
  return Math.floor((Date.now() + offsetMs) / 1000).toString()
}

function signBody(body, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
}

function buildWebhookPayload({ phone, phoneNumberId, messageId, messageType = "text", content = "Hola", timestamp }) {
  const ts = timestamp ?? unixTs()
  const waId = phone.replace(/^\+/, "")

  const msg = { from: waId, id: messageId, timestamp: ts }

  if (messageType === "text") {
    msg.type = "text"
    msg.text = { body: content }
  } else if (messageType === "image") {
    msg.type = "image"
    msg.image = { id: `imgid_${uid()}`, mime_type: "image/jpeg", caption: content || null }
  } else if (messageType === "audio") {
    msg.type = "audio"
    msg.audio = { id: `audioid_${uid()}`, mime_type: "audio/ogg; codecs=opus" }
  } else if (messageType === "interactive") {
    msg.type = "interactive"
    msg.interactive = { type: "button_reply", button_reply: { id: "btn1", title: content } }
  }

  return {
    object: "whatsapp_business_account",
    entry: [{
      id: `entry_${uid()}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "1234567890", phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: "Contacto Prueba" }, wa_id: waId }],
          messages: [msg],
        },
      }],
    }],
  }
}

function buildStatusPayload({ phoneNumberId, messageId, status = "delivered" }) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: `entry_${uid()}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "1234567890", phone_number_id: phoneNumberId },
          statuses: [{
            id: messageId,
            status,
            timestamp: unixTs(),
            recipient_id: "5491100000001",
          }],
        },
      }],
    }],
  }
}

// ─── Envío de webhook ──────────────────────────────────────────────────────────

async function sendWebhook(payload, opts, label = "") {
  const { url, dryRun, verbose } = opts
  const appSecret = process.env.WHATSAPP_APP_SECRET

  if (!appSecret) {
    console.error(`${RED}✗ WHATSAPP_APP_SECRET no está configurado en .env.local${RESET}`)
    process.exit(1)
  }

  const body = JSON.stringify(payload)
  const sig  = signBody(body, appSecret)

  if (dryRun) {
    console.log(`${DIM}[dry-run] ${label}${RESET}`)
    console.log(JSON.stringify(payload, null, 2))
    return { ok: true, status: 200, body: "(dry-run)", dryRun: true, ms: 0 }
  }

  const start = Date.now()
  let res, text
  try {
    res  = await fetch(`${url}/API/webhook/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sig,
      },
      body,
    })
    text = await res.text()
  } catch (err) {
    return { ok: false, status: 0, body: err.message, ms: Date.now() - start }
  }

  const ms = Date.now() - start
  if (verbose) console.log(`${DIM}  ← ${res.status} (${ms}ms): ${text}${RESET}`)
  return { ok: res.ok, status: res.status, body: text, ms }
}

async function sendCron(opts) {
  const { url, dryRun, verbose } = opts
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.warn(`${YELLOW}⚠  CRON_SECRET no configurado — saltando prueba de followups${RESET}`)
    return null
  }
  if (dryRun) {
    console.log(`${DIM}[dry-run] GET /API/followups/cron${RESET}`)
    return { ok: true, status: 200, body: "(dry-run)", ms: 0 }
  }
  const start = Date.now()
  let res, text
  try {
    res  = await fetch(`${url}/API/followups/cron`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    text = await res.text()
  } catch (err) {
    return { ok: false, status: 0, body: err.message, ms: Date.now() - start }
  }
  const ms = Date.now() - start
  if (verbose) console.log(`${DIM}  ← ${res.status} (${ms}ms): ${text}${RESET}`)
  return { ok: res.ok, status: res.status, body: text, ms }
}

// ─── Resultados ────────────────────────────────────────────────────────────────

const results = []

function record(name, result, expectOk = true) {
  const pass = expectOk ? result.ok : !result.ok
  const icon = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
  const time = result.dryRun ? "" : `${DIM} (${result.ms}ms)${RESET}`
  const warn = result.ms > 5000 && !result.dryRun ? ` ${YELLOW}⚡ lento${RESET}` : ""
  console.log(`  ${icon} ${name}${time}${warn}`)
  if (!pass) {
    console.log(`    ${RED}→ HTTP ${result.status}: ${result.body?.slice(0, 200)}${RESET}`)
  }
  results.push({ name, pass, ms: result.ms, status: result.status })
  return pass
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ─── Modos de simulación ───────────────────────────────────────────────────────

async function modeSingle(opts) {
  console.log(`\n${BOLD}${CYAN}◆ SINGLE — Flujo completo de un mensaje${RESET}`)
  console.log(`  Simula un usuario enviando "Hola" por WhatsApp.`)
  console.log(`  Verifica: recepción, guardado en DB e invocación del worker.\n`)

  const msgId = waMessageId()
  const payload = buildWebhookPayload({
    phone: opts.phone,
    phoneNumberId: opts.phoneNumberId,
    messageId: msgId,
    content: "Hola, ¿me pueden ayudar con información?",
  })

  const r = await sendWebhook(payload, opts, "POST /API/webhook/whatsapp — mensaje normal")
  record("Mensaje de texto normal → 200 OK", r)

  return r.ok
}

async function modeBurst(opts) {
  console.log(`\n${BOLD}${CYAN}◆ BURST — Prueba del mecanismo de debounce${RESET}`)
  console.log(`  Envía 3 mensajes a la misma conversación con 300ms de diferencia.`)
  console.log(`  Resultado esperado: solo el ÚLTIMO mensaje invoca al agente IA.`)
  console.log(`  Punto de falla: si el debounce falla, el agente responde 3 veces.\n`)

  const phone = opts.phone.replace(/\+?(\d+)/, "+$1")

  const messages = [
    { content: "Primera parte del mensaje..." },
    { content: "espera, déjame escribir mejor." },
    { content: "Quiero saber el precio del servicio premium." },
  ]

  const ids = []
  for (let i = 0; i < messages.length; i++) {
    const msgId = waMessageId()
    ids.push(msgId)
    const payload = buildWebhookPayload({
      phone,
      phoneNumberId: opts.phoneNumberId,
      messageId: msgId,
      content: messages[i].content,
      timestamp: unixTs(i * 200),  // 200ms entre mensajes
    })

    const label = `Mensaje burst ${i + 1}/3: "${messages[i].content.slice(0, 30)}"`
    const r = await sendWebhook(payload, opts, label)
    record(`Burst ${i + 1}/3 aceptado`, r)

    if (i < messages.length - 1) await sleep(300)
  }

  console.log(`\n  ${DIM}Observar en Vercel Logs: solo 1 invocación de agent-reply,`)
  console.log(`  los otros 2 workers deben retornar action: "cancelled" reason: "newer_message"${RESET}`)
  return true
}

async function modeConcurrent(opts) {
  const N = opts.count
  console.log(`\n${BOLD}${CYAN}◆ CONCURRENT — ${N} conversaciones simultáneas${RESET}`)
  console.log(`  Envía ${N} mensajes de usuarios distintos en paralelo.`)
  console.log(`  Verifica: todos son aceptados; mide tiempos de respuesta.`)
  console.log(`  Punto de falla: timeouts del webhook o colisiones en message_debounce.\n`)

  const promises = Array.from({ length: N }, (_, i) => {
    const phone = `+549110000${String(i + 1).padStart(4, "0")}`
    const payload = buildWebhookPayload({
      phone,
      phoneNumberId: opts.phoneNumberId,
      messageId: waMessageId(),
      content: `Mensaje de prueba de carga #${i + 1} — ${new Date().toISOString()}`,
    })
    return sendWebhook(payload, opts, `Concurrent ${i + 1}/${N}`)
  })

  const all = await Promise.all(promises)
  const passed = all.filter((r) => r.ok).length
  const maxMs  = Math.max(...all.map((r) => r.ms))
  const avgMs  = Math.round(all.reduce((s, r) => s + r.ms, 0) / all.length)

  for (let i = 0; i < all.length; i++) {
    record(`Concurrent ${i + 1}/${N} aceptado`, all[i])
  }

  console.log(`\n  ${DIM}Resultado: ${passed}/${N} OK | avg=${avgMs}ms | max=${maxMs}ms${RESET}`)

  if (maxMs > 10000) {
    console.log(`  ${YELLOW}⚠  Tiempo máximo > 10s — posible cuello de botella bajo carga${RESET}`)
  }
  return passed === N
}

async function modeDuplicate(opts) {
  console.log(`\n${BOLD}${CYAN}◆ DUPLICATE — Protección contra duplicados${RESET}`)
  console.log(`  Envía el mismo message_id dos veces.`)
  console.log(`  Resultado esperado: ambos retornan 200 OK, pero solo 1 se guarda en DB.`)
  console.log(`  Punto de falla: el agente responde dos veces al mismo mensaje.\n`)

  const msgId = waMessageId()
  const payload = buildWebhookPayload({
    phone: opts.phone,
    phoneNumberId: opts.phoneNumberId,
    messageId: msgId,
    content: "Mensaje duplicado — solo debería procesarse una vez",
  })

  const r1 = await sendWebhook(payload, opts, "Primera entrega")
  record("Primera entrega → 200 OK", r1)

  await sleep(200)

  const r2 = await sendWebhook(payload, opts, "Segunda entrega (duplicado)")
  record("Segunda entrega → 200 OK (webhook acepta, pero DB deduplica)", r2)

  console.log(`  ${DIM}Verificar en Supabase: la tabla messages debe tener solo 1 fila`)
  console.log(`  con wa_message_id=${msgId}${RESET}`)
  return r1.ok && r2.ok
}

async function modeStatus(opts) {
  console.log(`\n${BOLD}${CYAN}◆ STATUS — Actualización de estado de mensaje${RESET}`)
  console.log(`  Simula los callbacks de entrega/lectura que envía Meta.`)
  console.log(`  Punto de falla: error en processStatusUpdate corrompe el estado.\n`)

  const fakeMessageId = waMessageId()

  for (const status of ["sent", "delivered", "read"]) {
    const payload = buildStatusPayload({
      phoneNumberId: opts.phoneNumberId,
      messageId: fakeMessageId,
      status,
    })
    const r = await sendWebhook(payload, opts, `Status: ${status}`)
    record(`Status "${status}" → 200 OK`, r)
    await sleep(100)
  }
  return true
}

async function modeEdge(opts) {
  console.log(`\n${BOLD}${CYAN}◆ EDGE — Casos borde y mensajes especiales${RESET}`)
  console.log(`  Prueba mensajes que pueden romper el parsing o el LLM.\n`)

  const cases = [
    {
      name: "Emoji heavy",
      content: "🔥💪🎉✅❌🚀🤖👍😊🙏💯🎯📱💬🌟⭐🏆",
      type: "text",
    },
    {
      name: "Caracteres especiales HTML",
      content: '<script>alert("xss")</script> & \' " < > &amp;',
      type: "text",
    },
    {
      name: "Mensaje muy largo (2000 chars)",
      content: "Lorem ipsum dolor sit amet. ".repeat(70).slice(0, 2000),
      type: "text",
    },
    {
      name: "Solo espacios en blanco",
      content: "   ",
      type: "text",
    },
    {
      name: "Mensaje con saltos de línea",
      content: "Línea 1\nLínea 2\nLínea 3\n\nPárrafo nuevo",
      type: "text",
    },
    {
      name: "Imagen (no debe invocar worker)",
      content: "Mira esta foto",
      type: "image",
    },
    {
      name: "Audio (no debe invocar worker)",
      content: null,
      type: "audio",
    },
    {
      name: "Interactive button reply",
      content: "Sí, quiero más información",
      type: "interactive",
    },
  ]

  for (const c of cases) {
    const payload = buildWebhookPayload({
      phone: opts.phone,
      phoneNumberId: opts.phoneNumberId,
      messageId: waMessageId(),
      messageType: c.type,
      content: c.content,
    })
    const r = await sendWebhook(payload, opts, c.name)
    record(c.name + " → 200 OK", r)
    await sleep(150)
  }
  return true
}

async function modeFollowups(opts) {
  console.log(`\n${BOLD}${CYAN}◆ FOLLOWUPS — Disparo manual del cron de seguimientos${RESET}`)
  console.log(`  Llama a /API/followups/cron para verificar que funciona correctamente.`)
  console.log(`  Punto de falla: timeout por exceso de conversaciones activas.\n`)

  const r = await sendCron(opts)
  if (!r) return false

  try {
    const data = JSON.parse(r.body)
    record(`Cron ejecutado correctamente (triggered=${data.triggered ?? "?"} skipped=${data.skipped ?? "?"})`, r)
    if (r.ms > 30000) {
      console.log(`  ${YELLOW}⚠  El cron tardó ${r.ms}ms — cerca del límite de 60s de Vercel${RESET}`)
    }
  } catch {
    record("Cron respondió", r)
  }
  return r.ok
}

async function modeInvalidSignature(opts) {
  console.log(`\n${BOLD}${CYAN}◆ SECURITY — Firma HMAC inválida${RESET}`)
  console.log(`  Verifica que el webhook rechaza payloads sin firma válida.\n`)

  const { url, verbose, dryRun } = opts
  const payload = buildWebhookPayload({
    phone: opts.phone,
    phoneNumberId: opts.phoneNumberId,
    messageId: waMessageId(),
    content: "Mensaje con firma inválida",
  })

  if (dryRun) {
    console.log(`${DIM}[dry-run] POST /API/webhook/whatsapp — firma HMAC inválida (espera 401/403)${RESET}`)
    results.push({ name: "Firma inválida rechazada con 401/403", pass: true, ms: 0 })
    console.log(`  ${GREEN}✓${RESET} Firma inválida rechazada con 401/403`)
    return true
  }

  const start = Date.now()
  let res, text
  try {
    res  = await fetch(`${url}/API/webhook/whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=invalidsignature000000000000000000000",
      },
      body: JSON.stringify(payload),
    })
    text = await res.text()
  } catch (err) {
    console.log(`  ${RED}✗ No se pudo conectar: ${err.message}${RESET}`)
    return false
  }

  const ms = Date.now() - start
  const r  = { ok: !res.ok, status: res.status, body: text, ms }
  if (verbose) console.log(`${DIM}  ← ${res.status} (${ms}ms): ${text}${RESET}`)

  record("Firma inválida rechazada con 401/403", r, true)
  if (res.status === 200) {
    console.log(`  ${RED}  PROBLEMA CRÍTICO: el webhook aceptó una firma inválida!${RESET}`)
  }
  return r.ok
}

// ─── Reporte final ─────────────────────────────────────────────────────────────

function printSummary() {
  const total   = results.length
  const passed  = results.filter((r) => r.pass).length
  const failed  = results.filter((r) => !r.pass).length
  const slowOnes = results.filter((r) => r.ms > 5000 && !r.dryRun)

  console.log(`\n${"─".repeat(60)}`)
  console.log(`${BOLD}RESUMEN DE SIMULACIÓN${RESET}`)
  console.log(`${"─".repeat(60)}`)
  console.log(`  Total:   ${total}`)
  console.log(`  ${GREEN}Pasaron: ${passed}${RESET}`)
  if (failed > 0)   console.log(`  ${RED}Fallaron: ${failed}${RESET}`)
  if (slowOnes.length) {
    console.log(`  ${YELLOW}Lentos (>5s): ${slowOnes.map((r) => r.name).join(", ")}${RESET}`)
  }

  if (failed === 0) {
    console.log(`\n  ${GREEN}${BOLD}✓ Todos los tests pasaron${RESET}`)
  } else {
    console.log(`\n  ${RED}${BOLD}✗ ${failed} test(s) fallaron — revisar logs del servidor${RESET}`)
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.log(`\n  ${YELLOW}⚠  Sin OPENAI_API_KEY ni ANTHROPIC_API_KEY configurados.`)
    console.log(`     El webhook acepta mensajes pero el agente no puede responder.${RESET}`)
  }

  console.log(`\n  ${DIM}Consejo: abre los Vercel Logs (o tu terminal de dev) mientras`)
  console.log(`  ejecutas el simulador para ver el flujo completo en tiempo real.${RESET}\n`)
}

function printKnownRisks() {
  console.log(`\n${"─".repeat(60)}`)
  console.log(`${BOLD}RIESGOS CONOCIDOS A VIGILAR EN PRODUCCIÓN${RESET}`)
  console.log(`${"─".repeat(60)}`)

  const risks = [
    {
      level: "ALTO",
      color: RED,
      title: "agent-worker polling no escala > ~50 clientes",
      detail: "Cada mensaje abre una Serverless Function por 0-8s. Con 50+ clientes activos simultáneos se acumulan y se alcanza el límite de Vercel.",
      action: "Migrar a Inngest o Upstash QStash cuando superes 30 clientes activos.",
    },
    {
      level: "ALTO",
      color: RED,
      title: "Sin retry en fallos de LLM o WhatsApp API",
      detail: "Si OpenAI devuelve 500 o WhatsApp API falla, el mensaje se pierde silenciosamente.",
      action: "Verificar Vercel Logs después de cada hora pico. A futuro: dead-letter queue con Inngest.",
    },
    {
      level: "MEDIO",
      color: YELLOW,
      title: "followups/cron sin paginación",
      detail: "Con 200+ conversaciones activas la query puede exceder el timeout de 60s.",
      action: "Monitorear duración del cron. Añadir paginación si se acerca a 30s.",
    },
    {
      level: "MEDIO",
      color: YELLOW,
      title: "RLS incompleto — filtros por org solo en código",
      detail: "Si una query olvida el filtro .eq('organization_id', orgId), datos de un tenant pueden filtrarse a otro.",
      action: "Auditar cada nueva query antes de deploy. Habilitar RLS en tablas críticas.",
    },
    {
      level: "BAJO",
      color: DIM,
      title: "Supabase Realtime sin filtro de org",
      detail: "El cliente recibe eventos de todas las orgs y los descarta en JS — desperdicio de ancho de banda.",
      action: "Añadir filter: `organization_id=eq.${orgId}` en useSupabaseInbox.ts.",
    },
    {
      level: "BAJO",
      color: DIM,
      title: "pipeline_stages no filtra por organization_id",
      detail: "En agent-reply y followups/cron, la etapa se busca solo por nombre. Con orgs distintas que tienen etapas del mismo nombre, podría asignarse el agente incorrecto.",
      action: "Añadir organization_id a pipeline_stages y filtrar en las queries.",
    },
  ]

  for (const r of risks) {
    console.log(`\n  ${r.color}${BOLD}[${r.level}]${RESET} ${BOLD}${r.title}${RESET}`)
    console.log(`  ${DIM}${r.detail}${RESET}`)
    console.log(`  ${CYAN}→ ${r.action}${RESET}`)
  }
  console.log()
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()
  const opts = parseArgs()

  // Resolver phone_number_id
  if (!opts.phoneNumberId) {
    opts.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "000000000000000"
  }

  console.log(`\n${BOLD}contactos-saas — Simulador de producción${RESET}`)
  console.log(`${"─".repeat(60)}`)
  console.log(`  URL:            ${opts.url}`)
  console.log(`  Modo:           ${opts.mode}`)
  console.log(`  Teléfono:       ${opts.phone}`)
  console.log(`  phone_number_id: ${opts.phoneNumberId}`)
  console.log(`  Dry-run:        ${opts.dryRun ? "SÍ" : "no"}`)

  if (!process.env.WHATSAPP_APP_SECRET && !opts.dryRun) {
    console.error(`\n${RED}✗ WHATSAPP_APP_SECRET es obligatorio para firmar los webhooks.`)
    console.error(`  Añádelo a .env.local y vuelve a ejecutar.${RESET}\n`)
    process.exit(1)
  }

  const modeMap = {
    single:     modeSingle,
    burst:      modeBurst,
    concurrent: modeConcurrent,
    duplicate:  modeDuplicate,
    status:     modeStatus,
    edge:       modeEdge,
    followups:  modeFollowups,
    security:   modeInvalidSignature,
  }

  if (opts.mode === "all") {
    await modeSingle(opts)
    await sleep(1000)
    await modeBurst(opts)
    await sleep(2000)
    await modeConcurrent(opts)
    await sleep(1000)
    await modeDuplicate(opts)
    await sleep(500)
    await modeStatus(opts)
    await sleep(500)
    await modeEdge(opts)
    await sleep(500)
    await modeInvalidSignature(opts)
    await sleep(500)
    await modeFollowups(opts)
  } else if (opts.mode === "risks") {
    printKnownRisks()
    return
  } else if (modeMap[opts.mode]) {
    await modeMap[opts.mode](opts)
  } else {
    console.error(`${RED}Modo desconocido: ${opts.mode}${RESET}`)
    console.error(`Modos disponibles: ${Object.keys(modeMap).join(", ")}, all, risks`)
    process.exit(1)
  }

  printSummary()
  printKnownRisks()
}

main().catch((err) => {
  console.error(`${RED}Error fatal: ${err.message}${RESET}`)
  console.error(err.stack)
  process.exit(1)
})

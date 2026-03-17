import { getCatalogFunction } from "../catalog.js"

/**
 * Ejecuta una función de la integración Dentalink.
 *
 * @param {string} fnId  - ID de la función (ej: "buscar_paciente")
 * @param {object} params - Parámetros extraídos por el LLM
 * @param {object} config - Configuración de la integración { api_token, api_url }
 */
export async function execute(fnId, params, config) {
  const fnDef = getCatalogFunction("dentalink", fnId)
  if (!fnDef) throw new Error(`Función desconocida en Dentalink: ${fnId}`)

  const baseUrl   = (config.api_url || "https://api.dentalink.healthatom.com/api/v1").replace(/\/$/, "")
  const apiToken  = config.api_token

  if (!apiToken) throw new Error("Falta el token de API de Dentalink en la configuración.")

  const headers = {
    Authorization: `Token ${apiToken}`,
    "Content-Type": "application/json",
  }

  // 1. Resolver path params  (/pacientes/{id_paciente}/citas → /pacientes/42/citas)
  let path = fnDef.path.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key]
    if (val === undefined || val === null) throw new Error(`Falta el parámetro de ruta "${key}" para ${fnId}`)
    return encodeURIComponent(val)
  })

  let url = baseUrl + path

  // 2. Construir query string
  if (fnDef.http_method === "GET") {
    if (fnDef.query_format === "dentalink_q") {
      // Formato especial: ?q={"nombre":{"like":"%Juan%"},"rut":{"eq":"12345678-9"}}
      const qObj = {}
      for (const paramDef of fnDef.parameters ?? []) {
        if (paramDef.in !== "q_eq" && paramDef.in !== "q_like") continue
        const val = params[paramDef.name]
        if (val === undefined || val === null || val === "") continue
        if (paramDef.in === "q_like") {
          qObj[paramDef.name] = { like: `%${val}%` }
        } else {
          qObj[paramDef.name] = { eq: val }
        }
      }
      if (Object.keys(qObj).length > 0) {
        url += `?q=${encodeURIComponent(JSON.stringify(qObj))}`
      }
    } else {
      // Query params estándar
      const qs = new URLSearchParams()
      for (const paramDef of fnDef.parameters ?? []) {
        if (paramDef.in !== "query") continue
        const val = params[paramDef.name]
        if (val !== undefined && val !== null) qs.set(paramDef.name, String(val))
      }
      const qsStr = qs.toString()
      if (qsStr) url += `?${qsStr}`
    }
  }

  // 3. Construir body para POST/PUT
  let body
  if (["POST", "PUT", "PATCH"].includes(fnDef.http_method)) {
    const bodyObj = {}
    for (const paramDef of fnDef.parameters ?? []) {
      if (paramDef.in !== "body") continue
      const val = params[paramDef.name]
      if (val !== undefined && val !== null) bodyObj[paramDef.name] = val
    }
    body = JSON.stringify(bodyObj)
  }

  console.log(`[dentalink] ${fnDef.http_method} ${url}`)

  const res = await fetch(url, {
    method: fnDef.http_method,
    headers,
    body,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.error(`[dentalink] Error HTTP ${res.status} en ${fnId}:`, errText.slice(0, 300))
    return { error: `HTTP ${res.status}`, detail: errText.slice(0, 500) }
  }

  const ct     = res.headers.get("content-type") || ""
  const result = ct.includes("application/json") ? await res.json() : { text: await res.text() }
  console.log(`[dentalink] ${fnId} OK:`, JSON.stringify(result).slice(0, 300))
  return result
}

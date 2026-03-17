import { getCatalogFunction } from "../catalog.js"

/**
 * Ejecuta una función de la integración Admintour.
 *
 * @param {string} fnId  - ID de la función (ej: "consultar_disponibilidad")
 * @param {object} params - Parámetros extraídos por el LLM
 * @param {object} config - Configuración: { base_url, api_key, hotcod, servicio }
 */
export async function execute(fnId, params, config) {
  const fnDef = getCatalogFunction("admintour", fnId)
  if (!fnDef) throw new Error(`Función desconocida en Admintour: ${fnId}`)

  const baseUrl  = (config.base_url || "").replace(/\/$/, "")
  const apiKey   = config.api_key
  const hotcod   = config.hotcod
  const servicio = config.servicio || "MOTOREXTERNO"

  if (!baseUrl) throw new Error("Falta la URL base de Admintour en la configuración.")
  if (!apiKey)  throw new Error("Falta la API Key de Admintour en la configuración.")
  if (!hotcod)  throw new Error("Falta el código de hotel (hotcod) en la configuración.")

  const headers = {
    "x-api-key": apiKey,
    "Content-Type": "application/json",
  }

  if (fnId === "consultar_disponibilidad") {
    const { tipohab, desdefecha, hastafecha } = params

    if (!tipohab)    throw new Error("Falta el tipo de habitación (tipohab).")
    if (!desdefecha) throw new Error("Falta la fecha de inicio (desdefecha).")
    if (!hastafecha) throw new Error("Falta la fecha de fin (hastafecha).")

    const qs = new URLSearchParams({
      hotcod,
      Servicio: servicio,
      tipohab,
      desdefecha,
      hastafecha,
    })

    const url = `${baseUrl}/Externo_DisponibilidadHab?${qs.toString()}`
    console.log(`[admintour] GET ${url}`)

    const res = await fetch(url, { method: "GET", headers })
    return await handleResponse(res, fnId)
  }

  if (fnId === "crear_reserva") {
    const {
      nombre, apellido, fecha_desde, fecha_hasta, tipohab,
      telefono, correo, documento, adultos, menores = 0,
      observaciones = "", importe_total, reservamotor,
    } = params

    // Generar un número de reserva único si no se proveyó
    const numReserva = reservamotor
      ? Number(reservamotor)
      : parseInt(String(Date.now()).slice(-8))

    // Calcular días para construir las líneas de tarifa por día
    const desde = new Date(fecha_desde)
    const hasta  = new Date(fecha_hasta)
    const noches = Math.max(1, Math.round((hasta - desde) / 86400000))
    const importePorNoche = Math.round((importe_total / noches) * 100) / 100

    // Construir líneas de tarifa (una por noche)
    const tarifas = Array.from({ length: noches }, (_, i) => {
      const fecha = new Date(desde)
      fecha.setDate(fecha.getDate() + i)
      const fechaStr = fecha.toISOString().split("T")[0]
      return {
        MotorResTarLin:      i + 1,
        MotorResTarFecha:    fechaStr,
        MotorResTarCodigo:   0,
        MotorResTarMoneda:   1,
        MotorResTarSubTotal: importePorNoche,
        MotorResTarIva:      0,
        MotorResTarTotal:    importePorNoche,
      }
    })

    const body = {
      hotcod:        Number(hotcod),
      Servicio:      servicio,
      reservamotor:  numReserva,
      sdt_motorreserva: [
        {
          MotorReservaNombre:           nombre,
          MotorReservaDesde:            fecha_desde,
          MotorReservaHasta:            fecha_hasta,
          MotorReservaTelefono:         telefono || "",
          MotorReservaCorreo:           correo   || "",
          MotorReservaDireccion:        "",
          MotorReservaPais:             "1",
          MotorReservaDocumento:        documento,
          MotorReservaTipoDocumento:    "91",
          MotorReservaFecNacimiento:    "1990-01-01",
          MotorReservaAutoColor:        "",
          MotorReservaAutoMatricula:    "",
          MotorReservaAutoMarca:        "",
          MotorReservaObservaciones:    observaciones,
          MotorReservaNroTarjeta:       "",
          MotorReservaCSVTarjeta:       "",
          MotorReservaAnioVencTar:      "",
          MotorReservaMesVencTar:       "",
          MotorReservaNombreTitular:    nombre,
          MotorReservaApellidoTitular:  apellido,
          MotorReservaPagMoneda:        1,
          MotorReservaPagImportre:      importe_total,
          Reserva: [
            {
              MotorReservaLinea:      1,
              MotorReservaLinDesde:   fecha_desde,
              MotorReservaLinHasta:   fecha_hasta,
              MotorReservaLinTarifa:  1,
              MotorReservaLinTipHab:  tipohab,
              MotorReservaLinImporte: importe_total,
              MotorReservaLinMoneda:  1,
              MotorReservaLinSubTot:  importe_total,
              MotorReservaLinIva:     0,
              MotorReservaLinMayores: Number(adultos) || 1,
              MotorReservaLinMenores: Number(menores) || 0,
              MotorResTar:            tarifas,
            },
          ],
        },
      ],
    }

    const url = `${baseUrl}/Externo_GraboReservaMotor`
    console.log(`[admintour] POST ${url} reservamotor=${numReserva}`)

    const res = await fetch(url, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    })
    return await handleResponse(res, fnId)
  }

  throw new Error(`Función ${fnId} no implementada en el executor de Admintour.`)
}

async function handleResponse(res, fnId) {
  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    console.error(`[admintour] Error HTTP ${res.status} en ${fnId}:`, errText.slice(0, 300))
    return { error: `HTTP ${res.status}`, detail: errText.slice(0, 500) }
  }

  const ct     = res.headers.get("content-type") || ""
  const result = ct.includes("application/json") ? await res.json() : { text: await res.text() }
  console.log(`[admintour] ${fnId} OK:`, JSON.stringify(result).slice(0, 300))
  return result
}

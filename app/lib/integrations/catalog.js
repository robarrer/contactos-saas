/**
 * Catálogo de integraciones pre-configuradas.
 * Cada plataforma define sus campos de configuración y las funciones disponibles.
 * Las funciones son reutilizadas tanto para construir el schema de tools del LLM
 * como para ejecutarlas en el backend.
 */

export const INTEGRATIONS_CATALOG = {
  dentalink: {
    id: "dentalink",
    name: "Dentalink",
    description: "Sistema de gestión odontológica. Agenda citas, busca pacientes y consulta disponibilidad.",
    icon: "🦷",
    color: "#0ea5e9",
    docsUrl: "https://api.dentalink.healthatom.com/docs/",
    configFields: [
      {
        key: "api_token",
        label: "Token de API",
        type: "password",
        placeholder: "Ej: abc123xyz...",
        required: true,
        hint: "Obtén el token en Dentalink > Configuraciones > Acceso API.",
      },
      {
        key: "api_url",
        label: "URL de API",
        type: "url",
        placeholder: "https://api.dentalink.healthatom.com/api/v1",
        required: true,
        default: "https://api.dentalink.healthatom.com/api/v1",
        hint: "URL base de la API. Déjala por defecto salvo indicación de Dentalink.",
      },
    ],
    functions: [
      // ── Pacientes ──────────────────────────────────────────────
      {
        id: "buscar_paciente",
        name: "buscar_paciente",
        description:
          "Busca un paciente en Dentalink por nombre, apellidos, RUT o número de celular. Úsala cuando el usuario mencione el nombre de un paciente o quiera saber su información.",
        category: "Pacientes",
        http_method: "GET",
        path: "/pacientes",
        query_format: "dentalink_q",
        parameters: [
          { name: "nombre",    type: "string", description: "Nombre del paciente",                       required: false, in: "q_like" },
          { name: "apellidos", type: "string", description: "Apellidos del paciente",                    required: false, in: "q_like" },
          { name: "celular",   type: "string", description: "Celular del paciente (solo números)",        required: false, in: "q_eq" },
          { name: "rut",       type: "string", description: "RUT del paciente (ej: 12345678-9)",          required: false, in: "q_eq" },
        ],
      },
      {
        id: "crear_paciente",
        name: "crear_paciente",
        description:
          "Crea un nuevo paciente en Dentalink. Úsala cuando el usuario quiera registrar a un nuevo paciente.",
        category: "Pacientes",
        http_method: "POST",
        path: "/pacientes",
        parameters: [
          { name: "nombre",    type: "string", description: "Nombre del paciente",             required: true,  in: "body" },
          { name: "apellidos", type: "string", description: "Apellidos del paciente",           required: true,  in: "body" },
          { name: "celular",   type: "string", description: "Número de celular",                required: false, in: "body" },
          { name: "email",     type: "string", description: "Correo electrónico",               required: false, in: "body" },
          { name: "rut",       type: "string", description: "RUT del paciente (ej: 12345678-9)",required: false, in: "body" },
          { name: "sexo",      type: "string", description: "Sexo del paciente: M o F",         required: false, in: "body" },
        ],
      },
      {
        id: "obtener_citas_paciente",
        name: "obtener_citas_paciente",
        description:
          "Obtiene las citas de un paciente específico dado su ID en Dentalink. Útil para consultar historial o próximas citas de un paciente ya identificado.",
        category: "Pacientes",
        http_method: "GET",
        path: "/pacientes/{id_paciente}/citas",
        parameters: [
          { name: "id_paciente", type: "number", description: "ID numérico del paciente en Dentalink", required: true, in: "path" },
        ],
      },
      // ── Citas ──────────────────────────────────────────────────
      {
        id: "buscar_citas",
        name: "buscar_citas",
        description:
          "Busca citas en la clínica filtrando por fecha, dentista o estado. Úsala para consultar disponibilidad o citas de un día específico.",
        category: "Citas",
        http_method: "GET",
        path: "/citas",
        query_format: "dentalink_q",
        parameters: [
          { name: "fecha",       type: "string", description: "Fecha en formato YYYY-MM-DD",     required: false, in: "q_eq" },
          { name: "id_dentista", type: "number", description: "ID del dentista",                 required: false, in: "q_eq" },
          { name: "id_estado",   type: "number", description: "ID del estado de cita (ej: 7=No confirmado, 1=Anulado)", required: false, in: "q_eq" },
        ],
      },
      {
        id: "agendar_cita",
        name: "agendar_cita",
        description:
          "Agenda una nueva cita para un paciente en Dentalink. Requiere el ID del paciente, ID del dentista, ID de sucursal, fecha, hora y duración.",
        category: "Citas",
        http_method: "POST",
        path: "/citas",
        parameters: [
          { name: "id_paciente",  type: "number", description: "ID del paciente en Dentalink",             required: true,  in: "body" },
          { name: "id_dentista",  type: "number", description: "ID del dentista",                          required: true,  in: "body" },
          { name: "id_sucursal",  type: "number", description: "ID de la sucursal",                        required: true,  in: "body" },
          { name: "fecha",        type: "string", description: "Fecha en formato YYYY-MM-DD",               required: true,  in: "body" },
          { name: "hora_inicio",  type: "string", description: "Hora de inicio en formato HH:MM",           required: true,  in: "body" },
          { name: "duracion",     type: "number", description: "Duración en minutos (ej: 30, 60)",          required: true,  in: "body" },
          { name: "comentario",   type: "string", description: "Comentario u observaciones opcionales",     required: false, in: "body" },
        ],
      },
      {
        id: "cancelar_cita",
        name: "cancelar_cita",
        description:
          "Cancela o anula una cita existente en Dentalink dado su ID.",
        category: "Citas",
        http_method: "PUT",
        path: "/citas/{id_cita}",
        parameters: [
          { name: "id_cita",   type: "number", description: "ID de la cita a cancelar",         required: true,  in: "path" },
          { name: "id_estado", type: "number", description: "ID del estado de anulación (normalmente 1)",  required: false, in: "body" },
          { name: "comentarios", type: "string", description: "Motivo de la cancelación",        required: false, in: "body" },
        ],
      },
      // ── Recursos ───────────────────────────────────────────────
      {
        id: "obtener_dentistas",
        name: "obtener_dentistas",
        description:
          "Obtiene la lista de dentistas de la clínica. Úsala cuando el usuario pregunte por los profesionales disponibles o cuando necesites el ID de un dentista.",
        category: "Recursos",
        http_method: "GET",
        path: "/dentistas",
        parameters: [],
      },
      {
        id: "obtener_sucursales",
        name: "obtener_sucursales",
        description:
          "Obtiene la lista de sucursales de la clínica. Úsala cuando el usuario pregunte por las ubicaciones disponibles o cuando necesites el ID de una sucursal.",
        category: "Recursos",
        http_method: "GET",
        path: "/sucursales",
        parameters: [],
      },
    ],
  },

  admintour: {
    id: "admintour",
    name: "Admintour",
    description: "Sistema de gestión hotelera y cabañas. Consulta disponibilidad y crea reservas.",
    icon: "\u26FA",
    color: "#16a34a",
    docsUrl: "https://www.postman.com/mission-administrator-95001897/api-admintour/",
    configFields: [
      {
        key: "base_url",
        label: "URL base de la API",
        type: "url",
        placeholder: "https://tudominio.admintour.com/api",
        required: true,
        hint: "URL base que te proporciona Admintour. Solicítala a soporte.",
      },
      {
        key: "api_key",
        label: "API Key (x-api-key)",
        type: "password",
        placeholder: "vYIuuPCp...",
        required: true,
        hint: "Clave de API que te proporciona Admintour. Solicítala a soporte.",
      },
      {
        key: "hotcod",
        label: "Código de hotel (hotcod)",
        type: "text",
        placeholder: "Ej: 12",
        required: true,
        hint: "Código numérico que identifica tu propiedad en Admintour.",
      },
      {
        key: "servicio",
        label: "Servicio",
        type: "text",
        placeholder: "MOTOREXTERNO",
        required: false,
        default: "MOTOREXTERNO",
        hint: "Nombre del servicio configurado. Generalmente es MOTOREXTERNO.",
      },
    ],
    functions: [
      {
        id: "consultar_disponibilidad",
        name: "consultar_disponibilidad",
        description:
          "Consulta la disponibilidad de cabañas o habitaciones para un tipo específico en un rango de fechas. Úsala cuando el usuario pregunte por disponibilidad o quiera saber si hay lugar para ciertas fechas.",
        category: "Disponibilidad",
        http_method: "GET",
        path: "/Externo_DisponibilidadHab",
        parameters: [
          {
            name: "tipohab",
            type: "string",
            description: "Código del tipo de habitación o cabaña (ej: DOBMAT, MAT, MAT4). Consulta al usuario qué tipo prefiere o usa el que corresponda.",
            required: true,
            in: "query",
          },
          {
            name: "desdefecha",
            type: "string",
            description: "Fecha de inicio en formato MM-DD-AAAA (ej: 03-08-2026 para 8 de marzo de 2026).",
            required: true,
            in: "query",
          },
          {
            name: "hastafecha",
            type: "string",
            description: "Fecha de fin en formato MM-DD-AAAA (ej: 03-10-2026 para 10 de marzo de 2026).",
            required: true,
            in: "query",
          },
        ],
      },
      {
        id: "crear_reserva",
        name: "crear_reserva",
        description:
          "Crea una nueva reserva en Admintour con los datos del huésped y las fechas solicitadas. Úsala solo cuando el usuario haya confirmado todos los datos de la reserva.",
        category: "Reservas",
        http_method: "POST",
        path: "/Externo_GraboReservaMotor",
        parameters: [
          { name: "nombre",         type: "string", description: "Nombre del titular de la reserva",                            required: true,  in: "body" },
          { name: "apellido",       type: "string", description: "Apellido del titular de la reserva",                          required: true,  in: "body" },
          { name: "fecha_desde",    type: "string", description: "Fecha de check-in en formato AAAA-MM-DD (ej: 2026-03-08)",    required: true,  in: "body" },
          { name: "fecha_hasta",    type: "string", description: "Fecha de check-out en formato AAAA-MM-DD (ej: 2026-03-10)",   required: true,  in: "body" },
          { name: "tipohab",        type: "string", description: "Código del tipo de habitación o cabaña (ej: DOBMAT)",          required: true,  in: "body" },
          { name: "telefono",       type: "string", description: "Teléfono del huésped",                                        required: false, in: "body" },
          { name: "correo",         type: "string", description: "Email del huésped",                                           required: false, in: "body" },
          { name: "documento",      type: "string", description: "Número de documento/RUT del huésped",                         required: true,  in: "body" },
          { name: "adultos",        type: "number", description: "Cantidad de adultos",                                         required: true,  in: "body" },
          { name: "menores",        type: "number", description: "Cantidad de menores",                                         required: false, in: "body" },
          { name: "observaciones",  type: "string", description: "Observaciones o notas especiales de la reserva",              required: false, in: "body" },
          { name: "importe_total",  type: "number", description: "Importe total de la reserva en pesos",                        required: true,  in: "body" },
          { name: "reservamotor",   type: "number", description: "Número de reserva externo (máximo 8 dígitos numéricos). Genera uno único si el usuario no lo provee.", required: true, in: "body" },
        ],
      },
    ],
  },
}

/**
 * Devuelve la definición de una función de una plataforma dado su ID.
 */
export function getCatalogFunction(platform, fnId) {
  return INTEGRATIONS_CATALOG[platform]?.functions?.find((f) => f.id === fnId) ?? null
}

/**
 * Devuelve todas las funciones habilitadas de una integración, con sus definiciones del catálogo.
 */
export function getEnabledFunctions(platform, enabledFunctionIds) {
  const catalog = INTEGRATIONS_CATALOG[platform]
  if (!catalog) return []
  return (enabledFunctionIds ?? [])
    .map((id) => catalog.functions.find((f) => f.id === id))
    .filter(Boolean)
}

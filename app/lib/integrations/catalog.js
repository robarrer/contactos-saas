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

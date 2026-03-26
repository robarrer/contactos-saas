export type Channel = "whatsapp" | "instagram" | "facebook" | "webchat"
export type PipelineStage = "Nuevo contacto" | "Cita agendada" | "Cerrado"
export type MessageType = "text" | "image" | "document" | "audio" | "video" | "sticker" | "template"
export type MessageSender = "contact" | "agent" | "bot"
export type BotStatus = "bot" | "human"

export type Agent = {
  id: string
  name: string
  initials: string
  color: string
}

export type MockContact = {
  id: string
  first_name: string
  last_name: string
  phone?: string
  username?: string
  channels: Channel[]
  createdAt: string
  totalConversations: number
}

/** Helper para obtener el nombre completo de un contacto */
export function contactFullName(c: MockContact | undefined | null, fallback = "Contacto"): string {
  if (!c) return fallback
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
  return full || fallback
}

export type Message = {
  id: string
  conversationId: string
  sender: MessageSender
  agentId?: string
  text?: string
  type: MessageType
  templateName?: string        // nombre de la plantilla si type === "template"
  templateRendered?: string    // texto ya renderizado con variables sustituidas
  fileName?: string
  mediaUrl?: string            // "media:<id>" para medios de WA, o blob URL para optimistic
  mediaMime?: string
  isInternal: boolean
  timestamp: string
}

export type Conversation = {
  id: string
  contactId: string
  channel: Channel
  botStatus: BotStatus
  assignedAgentId: string | null
  pipelineStage: PipelineStage
  unreadCount: number
  lastMessage: string
  lastActivityAt: string
  lastInboundAt: string | null
  tags: string[]
}

export const AGENTS: Agent[] = [
  { id: "agent-1", name: "María González", initials: "MG", color: "#7c3aed" },
  { id: "agent-2", name: "Carlos Rojas", initials: "CR", color: "#0891b2" },
]

export const PIPELINE_STAGES: PipelineStage[] = [
  "Nuevo contacto",
  "Cita agendada",
  "Cerrado",
]

export const MOCK_CONTACTS: MockContact[] = [
  { id: "c1",  first_name: "Valentina", last_name: "Torres",   phone: "+56912345678", channels: ["whatsapp"],              createdAt: "2024-11-10", totalConversations: 3 },
  { id: "c2",  first_name: "Matías",    last_name: "Hernández", phone: "+56923456789", channels: ["whatsapp", "instagram"], createdAt: "2024-12-01", totalConversations: 2 },
  { id: "c3",  first_name: "Camila",    last_name: "Muñoz",    username: "@camila.munoz", channels: ["instagram"],         createdAt: "2025-01-15", totalConversations: 1 },
  { id: "c4",  first_name: "Diego",     last_name: "Soto",     phone: "+56934567890", channels: ["whatsapp"],              createdAt: "2025-01-20", totalConversations: 4 },
  { id: "c5",  first_name: "Isidora",   last_name: "Vargas",   phone: "+56945678901", channels: ["whatsapp"],              createdAt: "2025-02-03", totalConversations: 1 },
  { id: "c6",  first_name: "Sebastián", last_name: "Fuentes",  username: "@seba.fuentes", channels: ["instagram"],        createdAt: "2025-02-14", totalConversations: 2 },
  { id: "c7",  first_name: "Javiera",   last_name: "Pérez",    phone: "+56956789012", channels: ["whatsapp"],              createdAt: "2025-02-28", totalConversations: 1 },
  { id: "c8",  first_name: "Nicolás",   last_name: "Castro",   phone: "+56967890123", channels: ["whatsapp"],              createdAt: "2025-03-01", totalConversations: 2 },
  { id: "c9",  first_name: "Antonia",   last_name: "Ramírez",  username: "@antonia.r", channels: ["instagram"],           createdAt: "2025-03-05", totalConversations: 1 },
  { id: "c10", first_name: "Felipe",    last_name: "Morales",  phone: "+56978901234", channels: ["whatsapp"],              createdAt: "2025-03-08", totalConversations: 1 },
  { id: "c11", first_name: "Constanza", last_name: "Navarro",  phone: "+56989012345", channels: ["whatsapp"],              createdAt: "2025-03-09", totalConversations: 1 },
  { id: "c12", first_name: "Tomás",     last_name: "Ibáñez",   username: "@tomas.ib", channels: ["instagram"],            createdAt: "2025-03-10", totalConversations: 1 },
]

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv-1", contactId: "c1", channel: "whatsapp", botStatus: "human", assignedAgentId: "agent-1",
    pipelineStage: "Cita agendada", unreadCount: 0,
    lastMessage: "Gracias, entonces nos vemos el martes a las 10:30. ¡Hasta pronto!",
    lastActivityAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    tags: ["urgente"],
  },
  {
    id: "conv-2", contactId: "c2", channel: "whatsapp", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 3,
    lastMessage: "¿Cuánto cuesta una limpieza dental?",
    lastActivityAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-3", contactId: "c3", channel: "instagram", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 1,
    lastMessage: "Hola, quisiera saber los horarios de atención",
    lastActivityAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-4", contactId: "c4", channel: "whatsapp", botStatus: "human", assignedAgentId: "agent-2",
    pipelineStage: "Cita agendada", unreadCount: 2,
    lastMessage: "Perfecto, pero ¿pueden darme una hora más temprano?",
    lastActivityAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    tags: ["reagendar"],
  },
  {
    id: "conv-5", contactId: "c5", channel: "whatsapp", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 0,
    lastMessage: "Ok, gracias por la información 👍",
    lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-6", contactId: "c6", channel: "instagram", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 4,
    lastMessage: "¿Aceptan Fonasa nivel B para ortodoncia?",
    lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    tags: ["fonasa"],
  },
  {
    id: "conv-7", contactId: "c7", channel: "whatsapp", botStatus: "human", assignedAgentId: "agent-1",
    pipelineStage: "Cerrado", unreadCount: 0,
    lastMessage: "Muchas gracias por la atención 😊",
    lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-8", contactId: "c8", channel: "whatsapp", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 1,
    lastMessage: "¿Dónde están ubicados?",
    lastActivityAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-9", contactId: "c9", channel: "instagram", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Cita agendada", unreadCount: 0,
    lastMessage: "Confirmado para el viernes 14 a las 16:00 ✅",
    lastActivityAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-10", contactId: "c10", channel: "whatsapp", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 0,
    lastMessage: "Buenas tardes, ¿tienen disponibilidad esta semana?",
    lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
  {
    id: "conv-11", contactId: "c11", channel: "whatsapp", botStatus: "human", assignedAgentId: "agent-2",
    pipelineStage: "Cita agendada", unreadCount: 2,
    lastMessage: "Sí, ya pagué la reserva. ¿Me pueden enviar confirmación?",
    lastActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ["pago"],
  },
  {
    id: "conv-12", contactId: "c12", channel: "instagram", botStatus: "bot", assignedAgentId: null,
    pipelineStage: "Nuevo contacto", unreadCount: 0,
    lastMessage: "Hola, ¿tienen carillas dentales?",
    lastActivityAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    lastInboundAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    tags: [],
  },
]

const now = Date.now()
const m = (minutesAgo: number) => new Date(now - minutesAgo * 60 * 1000).toISOString()

export const MOCK_MESSAGES: Message[] = [
  // conv-1 (Valentina, human takeover, agent-1)
  { id: "m1-1", conversationId: "conv-1", sender: "contact", type: "text", text: "Hola, buenas tardes. Quisiera agendar una limpieza dental.", isInternal: false, timestamp: m(90) },
  { id: "m1-2", conversationId: "conv-1", sender: "bot", type: "text", text: "¡Hola Valentina! Soy el asistente de Clínica Sonríe. Con gusto te ayudo a agendar tu limpieza. ¿Qué día te acomoda mejor?", isInternal: false, timestamp: m(88) },
  { id: "m1-3", conversationId: "conv-1", sender: "contact", type: "text", text: "El martes si es posible, en la mañana", isInternal: false, timestamp: m(85) },
  { id: "m1-4", conversationId: "conv-1", sender: "bot", type: "text", text: "Déjame consultar la disponibilidad... Tenemos el martes 18 a las 10:30 o 11:00. ¿Cuál prefieres?", isInternal: false, timestamp: m(84) },
  { id: "m1-5", conversationId: "conv-1", sender: "contact", type: "text", text: "Las 10:30 perfecto. ¿Cuánto cuesta?", isInternal: false, timestamp: m(20) },
  { id: "m1-6", conversationId: "conv-1", sender: "agent", agentId: "agent-1", type: "text", text: "Hola Valentina, soy María. La limpieza dental tiene un valor de $25.000. ¿Confirmo la hora?", isInternal: false, timestamp: m(15) },
  { id: "m1-7", conversationId: "conv-1", sender: "agent", agentId: "agent-1", type: "text", text: "Recordarte que debes venir en ayunas de 2 horas si incluiremos fluorización.", isInternal: true, timestamp: m(10) },
  { id: "m1-8", conversationId: "conv-1", sender: "contact", type: "text", text: "Sí perfecto, confirmo 😊", isInternal: false, timestamp: m(5) },
  { id: "m1-9", conversationId: "conv-1", sender: "agent", agentId: "agent-1", type: "text", text: "¡Perfecto! Queda agendado para el martes 18 a las 10:30. Te enviaremos un recordatorio el día anterior.", isInternal: false, timestamp: m(3) },
  { id: "m1-10", conversationId: "conv-1", sender: "contact", type: "text", text: "Gracias, entonces nos vemos el martes a las 10:30. ¡Hasta pronto!", isInternal: false, timestamp: m(2) },

  // conv-2 (Matías, bot active, unread 3)
  { id: "m2-1", conversationId: "conv-2", sender: "contact", type: "text", text: "Buenas! Quería consultar sobre los precios", isInternal: false, timestamp: m(60) },
  { id: "m2-2", conversationId: "conv-2", sender: "bot", type: "text", text: "¡Hola Matías! Te paso nuestra lista de precios aproximados:\n• Limpieza dental: $25.000\n• Extracción simple: $35.000\n• Consulta: $20.000\n¿Te interesa algún tratamiento en particular?", isInternal: false, timestamp: m(58) },
  { id: "m2-3", conversationId: "conv-2", sender: "contact", type: "text", text: "¿Cuánto cuesta una limpieza dental?", isInternal: false, timestamp: m(10) },
  { id: "m2-4", conversationId: "conv-2", sender: "contact", type: "text", text: "Y también blanqueamiento", isInternal: false, timestamp: m(9) },
  { id: "m2-5", conversationId: "conv-2", sender: "contact", type: "text", text: "¿Tienen convenio con Isapre Colmena?", isInternal: false, timestamp: m(8) },

  // conv-3 (Camila, bot, unread 1, instagram)
  { id: "m3-1", conversationId: "conv-3", sender: "contact", type: "text", text: "Hola, quisiera saber los horarios de atención", isInternal: false, timestamp: m(25) },

  // conv-4 (Diego, human agent-2, unread 2)
  { id: "m4-1", conversationId: "conv-4", sender: "contact", type: "text", text: "Hola, necesito agendar una consulta lo antes posible", isInternal: false, timestamp: m(120) },
  { id: "m4-2", conversationId: "conv-4", sender: "bot", type: "text", text: "¡Hola Diego! Puedo ayudarte. ¿Qué tipo de consulta necesitas?", isInternal: false, timestamp: m(119) },
  { id: "m4-3", conversationId: "conv-4", sender: "contact", type: "text", text: "Tengo un dolor de muela fuerte desde ayer", isInternal: false, timestamp: m(115) },
  { id: "m4-4", conversationId: "conv-4", sender: "agent", agentId: "agent-2", type: "text", text: "Hola Diego, soy Carlos. Te damos prioridad. ¿Puedes venir hoy a las 17:00?", isInternal: false, timestamp: m(100) },
  { id: "m4-5", conversationId: "conv-4", sender: "contact", type: "text", text: "Sí, puedo ir. Confirmo.", isInternal: false, timestamp: m(90) },
  { id: "m4-6", conversationId: "conv-4", sender: "contact", type: "text", text: "Perfecto, pero ¿pueden darme una hora más temprano?", isInternal: false, timestamp: m(45) },
  { id: "m4-7", conversationId: "conv-4", sender: "contact", type: "text", text: "Si es posible a las 16:00 sería ideal", isInternal: false, timestamp: m(44) },

  // conv-5 (Isidora, bot, unread 0)
  { id: "m5-1", conversationId: "conv-5", sender: "contact", type: "text", text: "¿Están abiertos los sábados?", isInternal: false, timestamp: m(180) },
  { id: "m5-2", conversationId: "conv-5", sender: "bot", type: "text", text: "¡Hola Isidora! Atendemos de lunes a viernes de 9:00 a 19:00 y sábados de 9:00 a 14:00.", isInternal: false, timestamp: m(178) },
  { id: "m5-3", conversationId: "conv-5", sender: "contact", type: "text", text: "Ok, gracias por la información 👍", isInternal: false, timestamp: m(120) },

  // conv-6 (Sebastián, bot, unread 4, instagram)
  { id: "m6-1", conversationId: "conv-6", sender: "contact", type: "text", text: "Buenos días, tengo una consulta", isInternal: false, timestamp: m(200) },
  { id: "m6-2", conversationId: "conv-6", sender: "bot", type: "text", text: "¡Buenos días Sebastián! Claro, te escucho. ¿En qué te puedo ayudar?", isInternal: false, timestamp: m(198) },
  { id: "m6-3", conversationId: "conv-6", sender: "contact", type: "text", text: "¿Aceptan Fonasa nivel B para ortodoncia?", isInternal: false, timestamp: m(180) },
  { id: "m6-4", conversationId: "conv-6", sender: "contact", type: "text", text: "Es para mi hijo de 14 años", isInternal: false, timestamp: m(179) },
  { id: "m6-5", conversationId: "conv-6", sender: "contact", type: "text", text: "¿Cuánto sería el copago aproximado?", isInternal: false, timestamp: m(178) },
  { id: "m6-6", conversationId: "conv-6", sender: "contact", type: "text", text: "¿Hacen presupuesto gratis?", isInternal: false, timestamp: m(177) },

  // conv-7 (Javiera, human agent-1, cerrado)
  { id: "m7-1", conversationId: "conv-7", sender: "contact", type: "text", text: "Hola, quería agradecer la atención de la semana pasada", isInternal: false, timestamp: m(300) },
  { id: "m7-2", conversationId: "conv-7", sender: "agent", agentId: "agent-1", type: "text", text: "¡Hola Javiera! Con mucho gusto. ¿Cómo te fue con el tratamiento?", isInternal: false, timestamp: m(290) },
  { id: "m7-3", conversationId: "conv-7", sender: "contact", type: "text", text: "Todo bien, sin dolor. ¡Muy buenos profesionales!", isInternal: false, timestamp: m(285) },
  { id: "m7-4", conversationId: "conv-7", sender: "contact", type: "text", text: "Muchas gracias por la atención 😊", isInternal: false, timestamp: m(280) },

  // conv-8 (Nicolás, bot, unread 1)
  { id: "m8-1", conversationId: "conv-8", sender: "contact", type: "text", text: "¿Dónde están ubicados?", isInternal: false, timestamp: m(23 * 60) },

  // conv-9 (Antonia, bot, cita agendada, instagram)
  { id: "m9-1", conversationId: "conv-9", sender: "contact", type: "text", text: "Quiero agendar una hora para el viernes", isInternal: false, timestamp: m(27 * 60) },
  { id: "m9-2", conversationId: "conv-9", sender: "bot", type: "text", text: "¡Hola Antonia! El viernes tenemos disponibilidad a las 15:00 y 16:00. ¿Cuál te conviene?", isInternal: false, timestamp: m(26 * 60) },
  { id: "m9-3", conversationId: "conv-9", sender: "contact", type: "text", text: "Las 16:00 por favor", isInternal: false, timestamp: m(26 * 60 - 30) },
  { id: "m9-4", conversationId: "conv-9", sender: "bot", type: "text", text: "Confirmado para el viernes 14 a las 16:00 ✅", isInternal: false, timestamp: m(26 * 60 - 20) },

  // conv-10 (Felipe, bot)
  { id: "m10-1", conversationId: "conv-10", sender: "contact", type: "text", text: "Buenas tardes, ¿tienen disponibilidad esta semana?", isInternal: false, timestamp: m(2 * 24 * 60) },

  // conv-11 (Constanza, human agent-2, cita agendada)
  { id: "m11-1", conversationId: "conv-11", sender: "contact", type: "text", text: "Hola, quisiera reservar la hora de ortodoncia", isInternal: false, timestamp: m(3 * 24 * 60 + 60) },
  { id: "m11-2", conversationId: "conv-11", sender: "agent", agentId: "agent-2", type: "text", text: "Hola Constanza! Para confirmar la hora de ortodoncia necesito que canceles $15.000 de reserva.", isInternal: false, timestamp: m(3 * 24 * 60 + 30) },
  { id: "m11-3", conversationId: "conv-11", sender: "contact", type: "text", text: "Sí, ya pagué la reserva. ¿Me pueden enviar confirmación?", isInternal: false, timestamp: m(3 * 24 * 60) },
  { id: "m11-4", conversationId: "conv-11", sender: "contact", type: "text", text: "Número de transferencia: 3847291", isInternal: false, timestamp: m(3 * 24 * 60 - 1) },

  // conv-12 (Tomás, bot, instagram)
  { id: "m12-1", conversationId: "conv-12", sender: "contact", type: "text", text: "Hola, ¿tienen carillas dentales?", isInternal: false, timestamp: m(4 * 24 * 60) },
]

export type CannedResponse = {
  id: string
  category: string
  title: string
  content: string
}

export const CANNED_RESPONSES: CannedResponse[] = [
  {
    id: "cr-1",
    category: "Saludos",
    title: "Saludo inicial",
    content: "¡Hola! 👋 Bienvenido/a a Clínica Sonríe. Soy {{agente}}, ¿en qué puedo ayudarte hoy?",
  },
  {
    id: "cr-2",
    category: "Citas",
    title: "Confirmación de cita",
    content:
      "Tu cita ha sido confirmada para el {{fecha}} a las {{hora}}. Recuerda llegar 10 minutos antes. Ante cualquier cambio, avísanos con anticipación. ¡Te esperamos! 😊",
  },
  {
    id: "cr-3",
    category: "Fuera de horario",
    title: "Mensaje fuera de horario",
    content:
      "Gracias por contactarnos. Nuestro horario de atención es de lunes a viernes de 9:00 a 19:00 y sábados de 9:00 a 14:00. Responderemos tu consulta a la brevedad. 🦷",
  },
  {
    id: "cr-4",
    category: "Pagos",
    title: "Instrucciones de pago",
    content:
      "Puedes realizar la reserva de tu hora mediante transferencia a la cuenta:\nBanco: BancoEstado\nCuenta corriente: 123456789\nRUT: 76.543.210-K\nNombre: Clínica Sonríe SpA\nEnvíanos el comprobante por este mismo chat.",
  },
  {
    id: "cr-5",
    category: "Citas",
    title: "Recordatorio de cita",
    content:
      "Te recordamos que tienes una cita mañana a las {{hora}}. Por favor confirma tu asistencia respondiendo este mensaje. ¡Te esperamos! 🗓️",
  },
]

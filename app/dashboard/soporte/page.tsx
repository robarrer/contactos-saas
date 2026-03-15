"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"
import {
  AGENTS,
  PIPELINE_STAGES,
  type BotStatus,
  type Channel,
  type Conversation,
  type Message,
  type MockContact,
  type PipelineStage,
} from "./mockData"
import { useSupabaseInbox } from "./useSupabaseInbox"

type CannedResponse = {
  id: string
  category: string
  title: string
  content: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 172800) return "ayer"
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
}

// ─── Meta 24h window timer ────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000 // 24 horas en ms

function useMetaWindowCountdown(lastInboundAt: string | null) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!lastInboundAt) { setRemaining(null); return }

    function calc() {
      const elapsed = Date.now() - new Date(lastInboundAt!).getTime()
      const rem = WINDOW_MS - elapsed
      setRemaining(rem)
    }

    calc()
    const id = setInterval(calc, 10_000) // actualiza cada 10s
    return () => clearInterval(id)
  }, [lastInboundAt])

  return remaining
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expirada"
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/**
 * Muestra el tiempo restante de la ventana de 24h de Meta.
 * Solo aplica a WhatsApp. No se muestra si no hay lastInboundAt.
 */
function MetaWindowTimer({
  channel,
  lastInboundAt,
  compact = false,
}: {
  channel: string
  lastInboundAt: string | null
  compact?: boolean
}) {
  const remaining = useMetaWindowCountdown(lastInboundAt)

  // Solo aplica a WhatsApp y si hay fecha
  if (channel !== "whatsapp" || remaining === null) return null

  const expired  = remaining <= 0
  const critical = !expired && remaining < 2 * 3_600_000  // menos de 2h
  const warning  = !expired && !critical && remaining < 6 * 3_600_000 // menos de 6h

  const bg    = expired ? "#fef2f2" : critical ? "#fff7ed" : warning ? "#fefce8" : "#f0fdf4"
  const color = expired ? "#dc2626" : critical ? "#ea580c" : warning ? "#ca8a04" : "#16a34a"
  const dot   = expired ? "#dc2626" : critical ? "#ea580c" : warning ? "#eab308" : "#22c55e"

  if (compact) {
    // Versión compacta para la lista: solo un punto de color con tooltip
    return (
      <span
        title={expired ? "Ventana Meta expirada" : `Ventana Meta: ${formatCountdown(remaining)}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0, display: "inline-block" }} />
        {!expired && (
          <span style={{ fontSize: 10, color, fontWeight: 600, lineHeight: 1 }}>
            {formatCountdown(remaining)}
          </span>
        )}
        {expired && (
          <span style={{ fontSize: 10, color, fontWeight: 700, lineHeight: 1 }}>exp.</span>
        )}
      </span>
    )
  }

  // Versión completa para el top bar del chat
  return (
    <span
      title="Ventana de mensajería de Meta (WhatsApp). Tienes 24h desde el último mensaje del contacto para responder sin plantilla."
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 20, background: bg,
        fontSize: 12, fontWeight: 600, color, cursor: "default",
        border: `1px solid ${color}33`,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flexShrink: 0 }} />
      {expired ? "Ventana expirada" : `⏱ ${formatCountdown(remaining)}`}
    </span>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
}

function formatDateSeparator(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Hoy"
  if (d.toDateString() === yesterday.toDateString()) return "Ayer"
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "long" })
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

const CHANNEL_COLORS: Record<Channel, string> = {
  whatsapp: "#22c55e",
  instagram: "#e1306c",
  facebook: "#1877f2",
  webchat: "#6366f1",
}

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  webchat: "Webchat",
}

function ChannelIcon({ channel, size = 14 }: { channel: Channel; size?: number }) {
  const color = CHANNEL_COLORS[channel]
  if (channel === "whatsapp")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-label="WhatsApp">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    )
  if (channel === "instagram")
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-label="Instagram">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    )
  return (
    <span style={{ fontSize: size, color, fontWeight: 700, lineHeight: 1 }}>
      {channel === "facebook" ? "f" : "W"}
    </span>
  )
}

function Avatar({
  name,
  color = "#6b7280",
  size = 36,
}: {
  name: string
  color?: string
  size?: number
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.35,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </div>
  )
}

const AVATAR_COLORS = [
  "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626",
  "#6366f1", "#0d9488", "#b45309", "#9333ea", "#0369a1",
]
function contactColor(id: string): string {
  let n = 0
  for (const c of id) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

// ─── Left Panel ───────────────────────────────────────────────────────────────

type FilterTab = "all" | "bot" | "human" | "unassigned" | "mine"

function ConversationList({
  conversations,
  contacts,
  activeId,
  onSelect,
  loadingMore,
  hasMore,
  onSearch,
  onLoadMore,
}: {
  conversations: Conversation[]
  contacts: MockContact[]
  activeId: string | null
  onSelect: (id: string) => void
  loadingMore: boolean
  hasMore: boolean
  onSearch: (q: string) => void
  onLoadMore: () => void
}) {
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<FilterTab>("all")
  const [channelFilter, setChannelFilter] = useState<Channel | "all">("all")
  const [stageFilter, setStageFilter] = useState<PipelineStage | "all">("all")
  const sentinelRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce: llama onSearch 400ms después del último cambio
  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearch(value)
    }, 400)
  }

  // IntersectionObserver para scroll infinito
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore) onLoadMore()
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, onLoadMore])

  // Filtros locales (tab, canal, etapa) — siguen siendo en memoria sobre lo ya cargado
  const filtered = conversations.filter((c) => {
    const contact = contacts.find((ct) => ct.id === c.contactId)
    if (!contact) return false
    if (tab === "bot" && c.botStatus !== "bot") return false
    if (tab === "human" && c.botStatus !== "human") return false
    if (tab === "unassigned" && c.assignedAgentId !== null) return false
    if (tab === "mine" && c.assignedAgentId !== "agent-1") return false
    if (channelFilter !== "all" && c.channel !== channelFilter) return false
    if (stageFilter !== "all" && c.pipelineStage !== stageFilter) return false
    return true
  })

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  const TABS: { id: FilterTab; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "bot", label: "Bot" },
    { id: "human", label: "Humano" },
    { id: "unassigned", label: "Sin asignar" },
    { id: "mine", label: "Míos" },
  ]

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* Search */}
      <div style={{ padding: "12px 12px 8px" }}>
        <div style={{ position: "relative" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar conversaciones…"
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 10,
              paddingTop: 8,
              paddingBottom: 8,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 13,
              outline: "none",
              boxSizing: "border-box",
              background: "#f9fafb",
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          overflowX: "auto",
          gap: 4,
          padding: "0 12px 8px",
          scrollbarWidth: "none",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 10px",
              borderRadius: 20,
              border: "none",
              background: tab === t.id ? "#111827" : "#f3f4f6",
              color: tab === t.id ? "white" : "#4b5563",
              fontSize: 12,
              fontWeight: tab === t.id ? 600 : 400,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t.label}
            {t.id === "all" && totalUnread > 0 && (
              <span
                style={{
                  background: "#ef4444",
                  color: "white",
                  borderRadius: 20,
                  padding: "0 5px",
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: "16px",
                }}
              >
                {totalUnread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Secondary filters */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 10px" }}>
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as Channel | "all")}
          style={selectMiniStyle}
        >
          <option value="all">Canal</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="webchat">Webchat</option>
        </select>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as PipelineStage | "all")}
          style={selectMiniStyle}
        >
          <option value="all">Etapa</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, padding: 24 }}>
            No hay conversaciones
          </p>
        )}
        {filtered.map((conv) => {
          const contact = contacts.find((c) => c.id === conv.contactId)!
          const agent = AGENTS.find((a) => a.id === conv.assignedAgentId)
          const isActive = conv.id === activeId

          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                width: "100%",
                padding: "10px 12px",
                background: isActive ? "#eff6ff" : "transparent",
                border: "none",
                borderLeft: isActive ? "3px solid #2563eb" : "3px solid transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ position: "relative", flexShrink: 0 }}>
                <Avatar name={contact.name} color={contactColor(contact.id)} size={40} />
                <span
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    background: "white",
                    borderRadius: "50%",
                    padding: 1,
                    display: "flex",
                  }}
                >
                  <ChannelIcon channel={conv.channel} size={12} />
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#111827", truncate: true } as React.CSSProperties}>
                    {contact.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <MetaWindowTimer channel={conv.channel} lastInboundAt={conv.lastInboundAt} compact />
                    <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                      {relativeTime(conv.lastActivityAt)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: conv.botStatus === "bot" ? "#059669" : "#7c3aed",
                      background: conv.botStatus === "bot" ? "#dcfce7" : "#ede9fe",
                      padding: "1px 5px",
                      borderRadius: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {conv.botStatus === "bot" ? "🤖 Bot" : `👤 ${agent?.name.split(" ")[0] ?? "Agente"}`}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      background: "#f3f4f6",
                      padding: "1px 5px",
                      borderRadius: 4,
                      lineHeight: 1.4,
                    }}
                  >
                    {conv.pipelineStage}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                  <span
                    style={{
                      fontSize: 12,
                      color: conv.unreadCount > 0 ? "#111827" : "#6b7280",
                      fontWeight: conv.unreadCount > 0 ? 500 : 400,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 170,
                    }}
                  >
                    {conv.lastMessage}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span
                      style={{
                        background: "#22c55e",
                        color: "white",
                        borderRadius: 20,
                        padding: "0 6px",
                        fontSize: 10,
                        fontWeight: 700,
                        lineHeight: "18px",
                        flexShrink: 0,
                      }}
                    >
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}

        {/* Scroll infinito: sentinel + indicadores */}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loadingMore && (
          <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 12, padding: "8px 0" }}>
            Cargando más…
          </p>
        )}
        {!hasMore && conversations.length > 0 && (
          <p style={{ textAlign: "center", color: "#d1d5db", fontSize: 11, padding: "8px 0" }}>
            — fin —
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Center Panel ─────────────────────────────────────────────────────────────

function ChatPanel({
  conversation,
  contact,
  messages,
  onUpdateConversation,
  onSendMessage,
  showContactPanel,
  onToggleContactPanel,
}: {
  conversation: Conversation
  contact: MockContact
  messages: Message[]
  onUpdateConversation: (updated: Conversation) => void
  onSendMessage?: (text: string, isInternal: boolean) => Promise<boolean>
  showContactPanel?: boolean
  onToggleContactPanel?: () => void
}) {
  const [inputText, setInputText] = useState("")
  const [isInternal, setIsInternal] = useState(false)
  const [showCanned, setShowCanned] = useState(false)
  const [cannedSearch, setCannedSearch] = useState("")
  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  const [localMessages, setLocalMessages] = useState<Message[]>(messages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Cargar respuestas prediseñadas desde Supabase
  useEffect(() => {
    supabase
      .from("canned_responses")
      .select("id, category, title, content")
      .order("category")
      .order("title")
      .then(({ data }) => setCannedResponses(data ?? []))
  }, [])

  useEffect(() => {
    setLocalMessages(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [localMessages])

  async function sendMessage() {
    const text = inputText.trim()
    if (!text) return
    setInputText("")
    inputRef.current?.focus()

    if (onSendMessage) {
      await onSendMessage(text, isInternal)
    } else {
      // fallback local (mock)
      const msg: Message = {
        id: `new-${Date.now()}`,
        conversationId: conversation.id,
        sender: "agent",
        agentId: "agent-1",
        type: "text",
        text,
        isInternal,
        timestamp: new Date().toISOString(),
      }
      setLocalMessages((prev) => [...prev, msg])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function insertCanned(cr: CannedResponse) {
    setInputText(cr.content)
    setShowCanned(false)
    inputRef.current?.focus()
  }

  function toggleBotStatus() {
    onUpdateConversation({
      ...conversation,
      botStatus: conversation.botStatus === "bot" ? "human" : "bot",
      assignedAgentId: conversation.botStatus === "bot" ? "agent-1" : null,
    })
  }

  const assignedAgent = AGENTS.find((a) => a.id === conversation.assignedAgentId)

  // Group messages by date
  const grouped: { date: string; msgs: Message[] }[] = []
  for (const msg of localMessages) {
    const dateKey = new Date(msg.timestamp).toDateString()
    const last = grouped[grouped.length - 1]
    if (!last || last.date !== dateKey) {
      grouped.push({ date: dateKey, msgs: [msg] })
    } else {
      last.msgs.push(msg)
    }
  }

  const filteredCanned = cannedResponses.filter(
    (c) =>
      cannedSearch === "" ||
      c.title.toLowerCase().includes(cannedSearch.toLowerCase()) ||
      c.content.toLowerCase().includes(cannedSearch.toLowerCase())
  )
  const groupedCanned = filteredCanned.reduce<Record<string, CannedResponse[]>>((acc, c) => {
    ;(acc[c.category] = acc[c.category] || []).push(c)
    return acc
  }, {})

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: "1px solid #e5e7eb",
          background: "white",
          flexShrink: 0,
        }}
      >
        <Avatar name={contact.name} color={contactColor(contact.id)} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{contact.name}</span>
            <ChannelIcon channel={conversation.channel} size={14} />
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {assignedAgent ? (
              <span>
                Asignado a{" "}
                <strong style={{ color: assignedAgent.color }}>{assignedAgent.name}</strong>
              </span>
            ) : (
              "Sin asignar"
            )}
          </div>
        </div>

        {/* Pipeline stage */}
        <select
          value={conversation.pipelineStage}
          onChange={(e) =>
            onUpdateConversation({
              ...conversation,
              pipelineStage: e.target.value as PipelineStage,
            })
          }
          style={{
            fontSize: 12,
            padding: "5px 8px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#f9fafb",
            cursor: "pointer",
          }}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Bot/human toggle */}
        {conversation.botStatus === "bot" ? (
          <button
            onClick={toggleBotStatus}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#dcfce7",
              color: "#166534",
              border: "1px solid #bbf7d0",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            🤖 Bot activo · <strong>Tomar control</strong>
          </button>
        ) : (
          <button
            onClick={toggleBotStatus}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#ede9fe",
              color: "#5b21b6",
              border: "1px solid #ddd6fe",
              padding: "6px 12px",
              borderRadius: 8,
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            👤 Tú tienes el control · <strong>Devolver al bot</strong>
          </button>
        )}

        {/* Ventana 24h Meta */}
        <MetaWindowTimer channel={conversation.channel} lastInboundAt={conversation.lastInboundAt} />

        {/* Toggle panel contacto */}
        {onToggleContactPanel && (
          <button
            onClick={onToggleContactPanel}
            title={showContactPanel ? "Ocultar info del contacto" : "Ver info del contacto"}
            style={{
              marginLeft: 4,
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: showContactPanel ? "#eff6ff" : "#f9fafb",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={showContactPanel ? "#2563eb" : "#6b7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          background: "#f0f4f8",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {grouped.map((group) => (
          <div key={group.date}>
            <div style={{ textAlign: "center", margin: "12px 0" }}>
              <span
                style={{
                  fontSize: 11,
                  background: "#e2e8f0",
                  color: "#64748b",
                  padding: "3px 10px",
                  borderRadius: 20,
                }}
              >
                {formatDateSeparator(group.msgs[0].timestamp)}
              </span>
            </div>
            {groupConsecutive(group.msgs).map((cluster) =>
              cluster.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  hideAvatar={idx < cluster.length - 1}
                  hideTime={idx < cluster.length - 1}
                  isFirst={idx === 0}
                  isLast={idx === cluster.length - 1}
                  clusterSize={cluster.length}
                />
              ))
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Canned responses popover */}
      {showCanned && (
        <div
          style={{
            position: "absolute",
            bottom: 120,
            left: 16,
            right: 16,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            zIndex: 10,
            maxHeight: 320,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>Respuestas predefinidas</strong>
              <button
                onClick={() => setShowCanned(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
              >
                ×
              </button>
            </div>
            <input
              autoFocus
              value={cannedSearch}
              onChange={(e) => setCannedSearch(e.target.value)}
              placeholder="Buscar respuesta…"
              style={{
                width: "100%",
                padding: "6px 10px",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1, padding: 8 }}>
            {Object.entries(groupedCanned).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    padding: "4px 6px",
                  }}
                >
                  {cat}
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => insertCanned(item)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {item.content}
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {filteredCanned.length === 0 && (
              <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: 12 }}>
                Sin resultados
              </p>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div
        style={{
          borderTop: `3px solid ${isInternal ? "#f59e0b" : "#e5e7eb"}`,
          background: isInternal ? "#fffbeb" : "white",
          padding: "10px 12px",
          flexShrink: 0,
        }}
      >
        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          <button
            onClick={() => setIsInternal(false)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: !isInternal ? "#111827" : "white",
              color: !isInternal ? "white" : "#6b7280",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Mensaje
          </button>
          <button
            onClick={() => setIsInternal(true)}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "1px solid #e5e7eb",
              background: isInternal ? "#f59e0b" : "white",
              color: isInternal ? "white" : "#6b7280",
              fontSize: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            🔒 Nota interna
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInternal ? "Escribe una nota interna (no visible para el contacto)…" : "Escribe un mensaje… (Enter para enviar)"
            }
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              padding: "9px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              fontSize: 13,
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button
              onClick={() => { setShowCanned((v) => !v); setCannedSearch("") }}
              title="Respuestas predefinidas"
              style={iconButtonStyle}
            >
              ⚡
            </button>
            <button
              onClick={sendMessage}
              disabled={inputText.trim() === ""}
              title="Enviar (Enter)"
              style={{
                ...iconButtonStyle,
                background: inputText.trim() ? "#2563eb" : "#e5e7eb",
                color: inputText.trim() ? "white" : "#9ca3af",
                cursor: inputText.trim() ? "pointer" : "default",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Agrupa mensajes consecutivos del mismo remitente en el mismo minuto
function groupConsecutive(msgs: Message[]): Message[][] {
  const clusters: Message[][] = []
  for (const msg of msgs) {
    if (msg.isInternal) { clusters.push([msg]); continue }
    const last = clusters[clusters.length - 1]
    if (!last) { clusters.push([msg]); continue }
    const prev = last[last.length - 1]
    if (
      prev.isInternal ||
      prev.sender !== msg.sender ||
      (prev.sender === "agent" && prev.agentId !== msg.agentId) ||
      Math.floor(new Date(prev.timestamp).getTime() / 60000) !== Math.floor(new Date(msg.timestamp).getTime() / 60000)
    ) {
      clusters.push([msg])
    } else {
      last.push(msg)
    }
  }
  return clusters
}

function MessageBubble({
  message,
  hideAvatar = false,
  hideTime = false,
  isFirst = true,
  isLast = true,
  clusterSize = 1,
}: {
  message: Message
  hideAvatar?: boolean
  hideTime?: boolean
  isFirst?: boolean
  isLast?: boolean
  clusterSize?: number
}) {
  const isContact = message.sender === "contact"
  const isBot = message.sender === "bot"
  const isAgent = message.sender === "agent"
  const isNote = message.isInternal
  const isTemplate = message.type === "template"

  const agent = isAgent ? AGENTS.find((a) => a.id === message.agentId) : null

  if (isNote) {
    return (
      <div
        style={{
          background: "#fef9c3",
          border: "1px solid #fde68a",
          borderRadius: 10,
          padding: "10px 14px",
          margin: "6px 0",
          fontSize: 13,
          color: "#78350f",
        }}
        title={`Nota interna · ${formatTime(message.timestamp)}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span>🔒</span>
          <span style={{ fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>
            Nota interna {agent ? `· ${agent.name}` : ""}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#a78bfa" }}>
            {formatTime(message.timestamp)}
          </span>
        </div>
        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message.text}</span>
      </div>
    )
  }

  // Border radius adaptado a posición dentro del cluster
  // Lado "punta": el último mensaje del grupo tiene la punta (radio pequeño)
  // Los intermedios son redondeados en todos los lados con radio uniforme
  const isLeft = isContact || isBot
  const r = {
    top:    isFirst ? 16 : 4,
    bottom: isLast  ? 16 : 4,
  }
  const bubbleRadius = isLeft
    ? `${r.top}px ${r.top}px ${isLast ? 4 : r.bottom}px ${r.bottom}px`
    : `${r.top}px ${r.top}px ${r.bottom}px ${isLast ? 4 : r.bottom}px`

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isLeft ? "row" : "row-reverse",
        alignItems: "flex-end",
        gap: 6,
        marginTop: isFirst && clusterSize > 1 ? 6 : 1,
        marginBottom: isLast ? 2 : 0,
      }}
    >
      {/* Avatar: solo visible en el último del cluster (o si es único) */}
      {isLeft && (
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isBot ? "#e0e7ff" : "#e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
          visibility: hideAvatar ? "hidden" : "visible",
        }}>
          {isBot ? "🤖" : "👤"}
        </div>
      )}

      <div style={{ maxWidth: "72%", minWidth: 0 }}>
        {/* Etiqueta de remitente: solo en el primero del cluster */}
        {isFirst && isBot && (
          <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 600, display: "block", marginBottom: 2, marginLeft: 4 }}>
            Bot
          </span>
        )}
        {isFirst && isAgent && agent && (
          <span style={{ fontSize: 10, color: agent.color, fontWeight: 600, display: "block", marginBottom: 2, marginRight: 4, textAlign: "right" }}>
            {agent.name}
          </span>
        )}

        {isTemplate ? (
          <div
            title={new Date(message.timestamp).toLocaleString("es-CL")}
            style={{
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "16px 16px 4px 16px",
              overflow: "hidden",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ background: "#dcfce7", padding: "5px 12px", display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid #bbf7d0" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Plantilla · {message.templateName}
              </span>
            </div>
            <div style={{ padding: "9px 13px", fontSize: 13, lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap", color: "#166534" }}>
              {message.templateRendered ?? message.text ?? message.templateName}
            </div>
          </div>
        ) : (
          <div
            title={new Date(message.timestamp).toLocaleString("es-CL")}
            style={{
              background: isContact ? "white" : isBot ? "#e0e7ff" : "#2563eb",
              color: isAgent ? "white" : "#111827",
              padding: "9px 13px",
              borderRadius: bubbleRadius,
              fontSize: 13,
              lineHeight: 1.5,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
            }}
          >
            {message.text}
          </div>
        )}

        {/* Timestamp: solo en el último del cluster */}
        {!hideTime && (
          <div
            style={{
              fontSize: 10,
              color: "#9ca3af",
              marginTop: 2,
              textAlign: isAgent ? "right" : "left",
              paddingLeft: isLeft ? 4 : 0,
              paddingRight: isAgent ? 4 : 0,
            }}
          >
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Right Panel ──────────────────────────────────────────────────────────────

function ContactInfoPanel({
  contact,
  conversation,
  onUpdateConversation,
  onTogglePanel,
}: {
  contact: MockContact
  conversation: Conversation
  onUpdateConversation: (c: Conversation) => void
  onTogglePanel?: () => void
}) {
  const [tag, setTag] = useState("")
  const [localTags, setLocalTags] = useState(conversation.tags)
  const assignedAgent = AGENTS.find((a) => a.id === conversation.assignedAgentId)

  function addTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && tag.trim()) {
      setLocalTags((prev) => [...prev, tag.trim()])
      setTag("")
    }
  }

  function removeTag(t: string) {
    setLocalTags((prev) => prev.filter((x) => x !== t))
  }

  const convMessages: Message[] = []
  const openSince = relativeTime(conversation.lastActivityAt)

  return (
    <div style={{ padding: "16px 14px", overflowY: "auto", height: "100%" }}>
      {/* Contact header */}
      <div style={{ textAlign: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f3f4f6", position: "relative" }}>
        {/* Botón cerrar */}
        {onTogglePanel && (
          <button
            onClick={onTogglePanel}
            title="Cerrar panel"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        )}
        <Avatar name={contact.name} color={contactColor(contact.id)} size={56} />
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{contact.name}</div>
          {contact.phone && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{contact.phone}</div>}
          {contact.username && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{contact.username}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
          {contact.channels.map((ch) => (
            <span
              key={ch}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "#f3f4f6",
                padding: "3px 8px",
                borderRadius: 12,
                fontSize: 11,
              }}
            >
              <ChannelIcon channel={ch} size={11} />
              {CHANNEL_LABELS[ch]}
            </span>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <InfoRow label="Registrado" value={new Date(contact.createdAt).toLocaleDateString("es-CL")} />
      <InfoRow label="Conversaciones" value={String(contact.totalConversations)} />
      <InfoRow label="Mensajes (esta conv.)" value={String(convMessages.length)} />
      <InfoRow label="Abierto hace" value={openSince} />

      {/* Pipeline */}
      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Etapa</label>
        <select
          value={conversation.pipelineStage}
          onChange={(e) =>
            onUpdateConversation({ ...conversation, pipelineStage: e.target.value as PipelineStage })
          }
          style={{ ...selectMiniStyle, width: "100%" }}
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Assigned agent */}
      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Agente asignado</label>
        <select
          value={conversation.assignedAgentId ?? ""}
          onChange={(e) =>
            onUpdateConversation({ ...conversation, assignedAgentId: e.target.value || null })
          }
          style={{ ...selectMiniStyle, width: "100%" }}
        >
          <option value="">Sin asignar</option>
          {AGENTS.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Etiquetas</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {localTags.map((t) => (
            <span
              key={t}
              style={{
                background: "#e0e7ff",
                color: "#3730a3",
                padding: "3px 8px",
                borderRadius: 12,
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {t}
              <button
                onClick={() => removeTag(t)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#6366f1" }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={addTag}
          placeholder="Agregar etiqueta (Enter)"
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Link */}
      <div style={{ marginTop: 16 }}>
        <a
          href="/dashboard/contacts"
          style={{
            display: "block",
            textAlign: "center",
            fontSize: 13,
            color: "#2563eb",
            textDecoration: "none",
            padding: "8px",
            border: "1px solid #dbeafe",
            borderRadius: 8,
            background: "#eff6ff",
          }}
        >
          Ver perfil completo →
        </a>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 500, color: "#111827" }}>{value}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SoportePage() {
  const {
    conversations,
    contacts,
    messages,
    loading,
    loadingMore,
    hasMore,
    activeConvIdRef,
    loadMessages,
    markAsRead,
    sendMessage,
    updateConversation,
    searchConversations,
    loadMore,
    setConversations,
  } = useSupabaseInbox()

  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [showContactPanel, setShowContactPanel] = useState(true)

  async function handleSelectConversation(id: string) {
    setActiveConvId(id)
    activeConvIdRef.current = id
    await markAsRead(id)
    await loadMessages(id)
  }

  async function handleUpdateConversation(updated: Conversation) {
    await updateConversation(updated.id, {
      pipeline_stage: updated.pipelineStage,
      assigned_agent: updated.assignedAgentId,
      mode:           updated.botStatus === "bot" ? "bot" : "agent",
    })
  }

  async function handleSendMessage(text: string, isInternal: boolean) {
    if (!activeConvId) return false
    return sendMessage(activeConvId, text, isInternal, "Agente")
  }

  const activeConv    = conversations.find((c) => c.id === activeConvId)
  const activeContact = activeConv ? contacts.find((c) => c.id === activeConv.contactId) : null
  const activeMessages = messages.filter((m) => m.conversationId === activeConvId)

  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        gap: 0,
        overflow: "hidden",
        background: "#f9fafb",
        position: "relative",
      }}
    >
      {/* Left panel */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          background: "white",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 12px 0", borderBottom: "1px solid #f3f4f6" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>Mesa de soporte</h2>
        </div>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            Cargando conversaciones…
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            contacts={contacts}
            activeId={activeConvId}
            onSelect={handleSelectConversation}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onSearch={searchConversations}
            onLoadMore={loadMore}
          />
        )}
      </div>

      {/* Center panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {activeConv && activeContact ? (
          <ChatPanel
            key={activeConvId}
            conversation={activeConv}
            contact={activeContact}
            messages={activeMessages}
            onUpdateConversation={handleUpdateConversation}
            onSendMessage={handleSendMessage}
            showContactPanel={showContactPanel}
            onToggleContactPanel={() => setShowContactPanel((v) => !v)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 48 }}>💬</span>
            <p style={{ margin: 0, fontSize: 15 }}>Selecciona una conversación para comenzar</p>
          </div>
        )}
      </div>

      {/* Right panel */}
      <div
        style={{
          width: showContactPanel ? 260 : 0,
          flexShrink: 0,
          background: "white",
          borderLeft: showContactPanel ? "1px solid #e5e7eb" : "none",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transition: "width 0.2s ease",
        }}
      >
        {activeConv && activeContact ? (
          <ContactInfoPanel
            key={activeConvId}
            contact={activeContact}
            conversation={activeConv}
            onUpdateConversation={handleUpdateConversation}
            onTogglePanel={() => setShowContactPanel(false)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#d1d5db",
              fontSize: 13,
              padding: 16,
              textAlign: "center",
            }}
          >
            Selecciona una conversación para ver el perfil del contacto
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const selectMiniStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  cursor: "pointer",
  outline: "none",
}

const iconButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#f9fafb",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  padding: 0,
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
}

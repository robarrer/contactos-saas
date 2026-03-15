"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"
import {
  AGENTS,
  PIPELINE_STAGES,
  type BotStatus,
  type Channel,
  type Conversation,
  type MockContact,
  type PipelineStage,
} from "../soporte/mockData"

// ─── helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 172800) return "ayer"
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" })
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}

const AVATAR_COLORS = [
  "#7c3aed","#0891b2","#059669","#d97706","#dc2626",
  "#6366f1","#0d9488","#b45309","#9333ea","#0369a1",
]
function contactColor(id: string) {
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

const CHANNEL_COLORS: Record<Channel, string> = {
  whatsapp: "#22c55e", instagram: "#e1306c", facebook: "#1877f2", webchat: "#6366f1",
}
const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", webchat: "Webchat",
}

const STAGE_COLORS: Record<string, string> = {
  "Nuevo contacto": "#6366f1",
  "Cita agendada": "#f59e0b",
  "Cerrado": "#10b981",
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
  return <span style={{ fontSize: size, color, fontWeight: 700 }}>{channel === "facebook" ? "f" : "W"}</span>
}

function Avatar({ name, color = "#6b7280", size = 32 }: { name: string; color?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.35, fontWeight: 700, flexShrink: 0 }}>
      {initials(name)}
    </div>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

type SortCol = "lastActivityAt" | "contactName" | "pipelineStage" | "botStatus"
type SortDir = "asc" | "desc"

type StageConfig = {
  id: string
  name: string
  color: string
  agent_id?: string | null
}

const DEFAULT_STAGES: StageConfig[] = PIPELINE_STAGES.map((s) => ({
  id: s,
  name: s,
  color: STAGE_COLORS[s] ?? "#6b7280",
  agent_id: null,
}))

const PRESET_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#0891b2","#ec4899","#8b5cf6","#f97316"]

// ─── Filters ─────────────────────────────────────────────────────────────────

type Filters = {
  search: string
  channel: Channel | "all"
  agentId: string | "all"
  stages: string[]
  status: "all" | "bot" | "human" | "unassigned"
}

function useFilteredConversations(
  conversations: Conversation[],
  contacts: MockContact[],
  filters: Filters
) {
  return conversations.filter((conv) => {
    const contact = contacts.find((c) => c.id === conv.contactId)
    if (!contact) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!contact.name.toLowerCase().includes(q) && !conv.lastMessage.toLowerCase().includes(q)) return false
    }
    if (filters.channel !== "all" && conv.channel !== filters.channel) return false
    if (filters.agentId !== "all" && conv.assignedAgentId !== filters.agentId) return false
    if (filters.stages.length > 0 && !filters.stages.includes(conv.pipelineStage)) return false
    if (filters.status === "bot" && conv.botStatus !== "bot") return false
    if (filters.status === "human" && conv.botStatus !== "human") return false
    if (filters.status === "unassigned" && conv.assignedAgentId !== null) return false
    return true
  })
}

// ─── Stage multi-select dropdown ─────────────────────────────────────────────

function StageMultiSelect({
  stages,
  selected,
  onChange,
}: {
  stages: string[]
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  function toggle(stage: string) {
    onChange(selected.includes(stage) ? selected.filter((s) => s !== stage) : [...selected, stage])
  }

  const label =
    selected.length === 0 ? "Etapa" : selected.length === 1 ? selected[0] : `${selected.length} etapas`

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...filterInput,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: selected.length > 0 ? "#eff6ff" : "white",
          color: selected.length > 0 ? "#2563eb" : "#374151",
          border: selected.length > 0 ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5 }}>
          <path d="M1 3L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
            zIndex: 50,
            minWidth: 180,
            padding: 6,
          }}
        >
          {stages.map((s) => {
            const checked = selected.includes(s)
            return (
              <label
                key={s}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 7,
                  cursor: "pointer",
                  background: checked ? "#eff6ff" : "transparent",
                  fontSize: 13,
                  color: "#111827",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => { if (!checked) e.currentTarget.style.background = "#f9fafb" }}
                onMouseLeave={(e) => { if (!checked) e.currentTarget.style.background = "transparent" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s)}
                  style={{ accentColor: "#2563eb", width: 14, height: 14, cursor: "pointer" }}
                />
                {s}
              </label>
            )
          })}
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              style={{ width: "100%", marginTop: 4, padding: "5px 10px", border: "none", background: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", textAlign: "left" }}
            >
              Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function TopBar({
  view, setView, filters, setFilters, total, showStageManager, setShowStageManager,
}: {
  view: "lista" | "embudo"
  setView: (v: "lista" | "embudo") => void
  filters: Filters
  setFilters: (f: Filters) => void
  total: number
  showStageManager: boolean
  setShowStageManager: (v: boolean) => void
}) {
  const upd = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch })

  return (
    <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 20px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Embudo</h1>
          <span style={{ fontSize: 12, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 12, fontWeight: 500 }}>
            {total} conversaciones
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {view === "embudo" && (
            <button onClick={() => setShowStageManager(true)} style={outlineBtn}>
              ⚙ Gestionar etapas
            </button>
          )}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 3 }}>
            {(["lista", "embudo"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: view === v ? "white" : "transparent", color: view === v ? "#111827" : "#6b7280", fontWeight: view === v ? 600 : 400, fontSize: 13, cursor: "pointer", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                {v === "lista" ? "Lista" : "Embudo"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input value={filters.search} onChange={(e) => upd({ search: e.target.value })} placeholder="Buscar…" style={{ ...filterInput, paddingLeft: 28, width: 180 }} />
        </div>

        {/* Channel */}
        <select value={filters.channel} onChange={(e) => upd({ channel: e.target.value as Channel | "all" })} style={filterInput}>
          <option value="all">Canal</option>
          {(["whatsapp","instagram","facebook","webchat"] as Channel[]).map((ch) => (
            <option key={ch} value={ch}>{CHANNEL_LABELS[ch]}</option>
          ))}
        </select>

        {/* Agent */}
        <select value={filters.agentId} onChange={(e) => upd({ agentId: e.target.value })} style={filterInput}>
          <option value="all">Agente</option>
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* Stage multiselect — dropdown con checkboxes */}
        <StageMultiSelect
          stages={PIPELINE_STAGES as unknown as string[]}
          selected={filters.stages}
          onChange={(stages) => upd({ stages })}
        />

        {/* Status */}
        <select value={filters.status} onChange={(e) => upd({ status: e.target.value as Filters["status"] })} style={filterInput}>
          <option value="all">Todos</option>
          <option value="bot">Bot activo</option>
          <option value="human">Con agente</option>
          <option value="unassigned">Sin asignar</option>
        </select>
      </div>
    </div>
  )
}

// ─── VISTA LISTA ─────────────────────────────────────────────────────────────

function ListView({
  conversations,
  contacts,
  onUpdate,
  onOpen,
}: {
  conversations: Conversation[]
  contacts: MockContact[]
  onUpdate: (c: Conversation) => void
  onOpen: (id: string) => void
}) {
  const [sortCol, setSortCol] = useState<SortCol>("lastActivityAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAgent, setBulkAgent] = useState("")
  const [bulkStage, setBulkStage] = useState<PipelineStage | "">("")

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortCol(col); setSortDir("desc") }
  }

  const sorted = [...conversations].sort((a, b) => {
    let av = "", bv = ""
    if (sortCol === "lastActivityAt") { av = a.lastActivityAt; bv = b.lastActivityAt }
    if (sortCol === "contactName") {
      av = contacts.find((c) => c.id === a.contactId)?.name ?? ""
      bv = contacts.find((c) => c.id === b.contactId)?.name ?? ""
    }
    if (sortCol === "pipelineStage") { av = a.pipelineStage; bv = b.pipelineStage }
    if (sortCol === "botStatus") { av = a.botStatus; bv = b.botStatus }
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sorted.map((c) => c.id)) : new Set())
  }

  function applyBulk() {
    if (bulkAgent) {
      selected.forEach((id) => {
        const c = conversations.find((x) => x.id === id)
        if (c) onUpdate({ ...c, assignedAgentId: bulkAgent || null })
      })
    }
    if (bulkStage) {
      selected.forEach((id) => {
        const c = conversations.find((x) => x.id === id)
        if (c) onUpdate({ ...c, pipelineStage: bulkStage })
      })
    }
    setSelected(new Set()); setBulkAgent(""); setBulkStage("")
  }

  const allSelected = sorted.length > 0 && sorted.every((c) => selected.has(c.id))
  const someSelected = sorted.some((c) => selected.has(c.id))

  const headerRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  function SortArrow({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span style={{ color: "#d1d5db", marginLeft: 4 }}>↕</span>
    return <span style={{ color: "#2563eb", marginLeft: 4 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  if (sorted.length === 0) return <EmptyState />

  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      {/* Bulk actions bar */}
      {someSelected && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", background: "#eff6ff", borderBottom: "1px solid #dbeafe" }}>
          <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 500 }}>{selected.size} seleccionada(s)</span>
          <select value={bulkAgent} onChange={(e) => setBulkAgent(e.target.value)} style={filterInput}>
            <option value="">Reasignar agente…</option>
            <option value="">Sin asignar</option>
            {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value as PipelineStage | "")} style={filterInput}>
            <option value="">Mover etapa…</option>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={applyBulk} disabled={!bulkAgent && !bulkStage} style={{ ...primaryBtn, fontSize: 12, padding: "5px 12px" }}>Aplicar</button>
          <button onClick={() => setSelected(new Set())} style={{ ...outlineBtn, fontSize: 12 }}>Cancelar</button>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <th style={{ ...th, width: 40 }}>
              <input ref={headerRef} type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} />
            </th>
            <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("contactName")}>
              Contacto <SortArrow col="contactName" />
            </th>
            <th style={th}>Último mensaje</th>
            <th style={th}>Canal</th>
            <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("pipelineStage")}>
              Etapa <SortArrow col="pipelineStage" />
            </th>
            <th style={th}>Agente</th>
            <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("botStatus")}>
              Estado <SortArrow col="botStatus" />
            </th>
            <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("lastActivityAt")}>
              Actividad <SortArrow col="lastActivityAt" />
            </th>
            <th style={th}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((conv) => {
            const contact = contacts.find((c) => c.id === conv.contactId)
            const agent = AGENTS.find((a) => a.id === conv.assignedAgentId)
            const isSelected = selected.has(conv.id)
            const hasUnread = conv.unreadCount > 0

            return (
              <tr
                key={conv.id}
                onClick={() => onOpen(conv.id)}
                style={{ borderBottom: "1px solid #f3f4f6", background: isSelected ? "#eff6ff" : "white", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f9fafb" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "#eff6ff" : "white" }}
              >
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={isSelected} onChange={(e) => {
                    const next = new Set(selected)
                    e.target.checked ? next.add(conv.id) : next.delete(conv.id)
                    setSelected(next)
                  }} />
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                      <Avatar name={contact?.name ?? "?"} color={contactColor(contact?.id ?? conv.contactId)} size={32} />
                      {hasUnread && <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "#22c55e", border: "1.5px solid white" }} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: hasUnread ? 700 : 500, color: "#111827" }}>{contact?.name ?? "Contacto"}</span>
                  </div>
                </td>
                <td style={{ ...td, maxWidth: 220 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", fontWeight: hasUnread ? 600 : 400 }}>
                    {conv.lastMessage}
                  </span>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <ChannelIcon channel={conv.channel} size={14} />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>{CHANNEL_LABELS[conv.channel]}</span>
                  </div>
                </td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={conv.pipelineStage}
                    onChange={(e) => onUpdate({ ...conv, pipelineStage: e.target.value as PipelineStage })}
                    style={{ ...filterInput, background: "transparent", border: "none", fontWeight: 500, fontSize: 12, color: STAGE_COLORS[conv.pipelineStage] ?? "#6b7280", cursor: "pointer", padding: "3px 4px" }}
                  >
                    {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={conv.assignedAgentId ?? ""}
                    onChange={(e) => onUpdate({ ...conv, assignedAgentId: e.target.value || null })}
                    style={{ ...filterInput, background: "transparent", border: "none", fontSize: 12, cursor: "pointer", padding: "3px 4px" }}
                  >
                    <option value="">Sin asignar</option>
                    {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                <td style={td}>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, background: conv.botStatus === "bot" ? "#dcfce7" : "#ede9fe", color: conv.botStatus === "bot" ? "#166534" : "#5b21b6", fontWeight: 500 }}>
                    {conv.botStatus === "bot" ? "🤖 Bot" : `👤 ${agent?.name.split(" ")[0] ?? "Agente"}`}
                  </span>
                </td>
                <td style={{ ...td, fontSize: 12, color: "#6b7280" }}>
                  {relativeTime(conv.lastActivityAt)}
                  {hasUnread && <span style={{ marginLeft: 4, background: "#22c55e", color: "white", borderRadius: 10, padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>{conv.unreadCount}</span>}
                </td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onOpen(conv.id)} style={{ ...primaryBtn, fontSize: 12, padding: "5px 10px" }}>Abrir</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── VISTA EMBUDO ─────────────────────────────────────────────────────────────

function EmbudoView({
  conversations,
  contacts,
  stages,
  onUpdate,
  onOpen,
}: {
  conversations: Conversation[]
  contacts: MockContact[]
  stages: StageConfig[]
  onUpdate: (c: Conversation) => void
  onOpen: (id: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, convId: string) {
    setDraggingId(convId)
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDrop(e: React.DragEvent, stageName: string) {
    e.preventDefault()
    if (!draggingId) return
    const conv = conversations.find((c) => c.id === draggingId)
    if (conv && conv.pipelineStage !== stageName) {
      onUpdate({ ...conv, pipelineStage: stageName as PipelineStage })
    }
    setDraggingId(null); setOverStage(null)
  }

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", overflowY: "hidden", padding: "16px 20px", flex: 1, alignItems: "stretch" }}>
      {stages.map((stage) => {
        const cards = conversations.filter((c) => c.pipelineStage === stage.name || c.pipelineStage === stage.id)
        const isOver = overStage === stage.name
        return (
          <div
            key={stage.id}
            onDragOver={(e) => { e.preventDefault(); setOverStage(stage.name) }}
            onDragLeave={() => setOverStage(null)}
            onDrop={(e) => handleDrop(e, stage.name)}
            style={{ width: 280, flexShrink: 0, background: isOver ? "#f0f7ff" : "#f3f4f6", borderRadius: 12, border: `2px solid ${isOver ? stage.color : "transparent"}`, transition: "border-color 150ms, background 150ms", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e5e7eb", borderLeft: `4px solid ${stage.color}`, background: "white", borderRadius: "10px 10px 0 0" }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{stage.name}</span>
              <span style={{ background: stage.color + "22", color: stage.color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>{cards.length}</span>
            </div>

            {/* Cards */}
            <div style={{ overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {cards.length === 0 && (
                <div style={{ border: "2px dashed #e5e7eb", borderRadius: 10, padding: "20px 0", textAlign: "center", color: "#d1d5db", fontSize: 13 }}>
                  Sin conversaciones
                </div>
              )}
              {cards.map((conv) => (
                <KanbanCard
                  key={conv.id}
                  conv={conv}
                  contact={contacts.find((c) => c.id === conv.contactId)}
                  stages={stages}
                  isDragging={draggingId === conv.id}
                  onDragStart={(e) => handleDragStart(e, conv.id)}
                  onDragEnd={() => { setDraggingId(null); setOverStage(null) }}
                  onUpdate={onUpdate}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KanbanCard({
  conv, contact, stages, isDragging, onDragStart, onDragEnd, onUpdate, onOpen,
}: {
  conv: Conversation
  contact: MockContact | undefined
  stages: StageConfig[]
  isDragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onUpdate: (c: Conversation) => void
  onOpen: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const agent = AGENTS.find((a) => a.id === conv.assignedAgentId)
  const hasUnread = conv.unreadCount > 0

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(conv.id)}
      style={{
        background: "white", borderRadius: 10, cursor: "grab", userSelect: "none",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.06)",
        border: "1px solid #e5e7eb", transition: "box-shadow 150ms", overflow: "hidden",
      }}
    >
      <div style={{ padding: 12 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ position: "relative" }}>
          <Avatar name={contact?.name ?? "?"} color={contactColor(contact?.id ?? conv.contactId)} size={30} />
          {hasUnread && <span style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "#22c55e", border: "1.5px solid white" }} />}
        </div>
        <span style={{ fontWeight: hasUnread ? 700 : 600, fontSize: 13, flex: 1, color: "#111827" }}>{contact?.name ?? "Contacto"}</span>
        <ChannelIcon channel={conv.channel} size={13} />
      </div>

      {/* Last message */}
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: hasUnread ? 600 : 400 }}>
        {conv.lastMessage}
      </p>

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: conv.botStatus === "bot" ? "#dcfce7" : "#ede9fe", color: conv.botStatus === "bot" ? "#166534" : "#5b21b6", fontWeight: 500 }}>
          {conv.botStatus === "bot" ? "🤖 Bot" : "👤 Agente"}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#9ca3af" }}>{relativeTime(conv.lastActivityAt)}</span>
        {agent && (
          <div title={agent.name} style={{ width: 20, height: 20, borderRadius: "50%", background: agent.color, color: "white", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
            {agent.initials}
          </div>
        )}
      </div>

      {/* Tags */}
      {conv.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {conv.tags.map((t) => (
            <span key={t} style={{ fontSize: 10, background: "#e0e7ff", color: "#3730a3", padding: "2px 7px", borderRadius: 10 }}>{t}</span>
          ))}
        </div>
      )}
      </div>

      {/* Hover quick actions — siempre renderizadas, visibles solo en hover */}
      <div
        style={{
          borderTop: hovered ? "1px solid #f3f4f6" : "1px solid transparent",
          padding: "7px 10px",
          display: "flex",
          gap: 6,
          background: "white",
          overflow: "hidden",
          maxHeight: hovered ? 60 : 0,
          opacity: hovered ? 1 : 0,
          transition: "max-height 150ms ease, opacity 150ms ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => onOpen(conv.id)} style={{ ...primaryBtn, fontSize: 11, padding: "5px 10px", flex: "0 0 auto" }}>Abrir</button>
        <select
          value={conv.assignedAgentId ?? ""}
          onChange={(e) => onUpdate({ ...conv, assignedAgentId: e.target.value || null })}
          style={{ ...filterInput, fontSize: 11, flex: 1, minWidth: 0 }}
        >
          <option value="">Reasignar…</option>
          {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select
          value={conv.pipelineStage}
          onChange={(e) => onUpdate({ ...conv, pipelineStage: e.target.value as PipelineStage })}
          style={{ ...filterInput, fontSize: 11, flex: 1, minWidth: 0 }}
        >
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </div>
  )
}

// ─── Stage Manager Modal ──────────────────────────────────────────────────────

function StageManagerModal({
  stages,
  conversations,
  aiAgents,
  onSave,
  onClose,
}: {
  stages: StageConfig[]
  conversations: Conversation[]
  aiAgents: DbAgent[]
  onSave: (stages: StageConfig[]) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<StageConfig[]>(stages.map((s) => ({ ...s })))
  const [newName, setNewName] = useState("")
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null)
  const [deleteMoveTarget, setDeleteMoveTarget] = useState<string>("")

  function addStage() {
    const name = newName.trim()
    if (!name || local.some((s) => s.name === name)) return
    setLocal([...local, { id: name, name, color: PRESET_COLORS[local.length % PRESET_COLORS.length] }])
    setNewName("")
  }

  function handleDropRow(targetIdx: number) {
    if (draggingIdx === null || draggingIdx === targetIdx) return
    const next = [...local]
    const [item] = next.splice(draggingIdx, 1)
    next.splice(targetIdx, 0, item)
    setLocal(next)
    setDraggingIdx(null); setOverIdx(null)
  }

  function confirmDelete() {
    if (deleteIdx === null) return
    const target = local[deleteIdx]
    const next = local.filter((_, i) => i !== deleteIdx)
    setLocal(next)
    setDeleteIdx(null)
    // we'd move convs in a real app; here just close
  }

  useEffect(() => {
    if (!deleteMoveTarget && local.length > 0) setDeleteMoveTarget(local[0]?.id ?? "")
  }, [deleteIdx, local, deleteMoveTarget])

  const stageConvCount = (id: string) => conversations.filter((c) => c.pipelineStage === id).length

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Gestionar etapas"
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: "min(480px,100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", maxHeight: "85vh" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Gestionar etapas</h2>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {local.map((stage, idx) => (
            <div
              key={stage.id}
              draggable
              onDragStart={() => setDraggingIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx) }}
              onDragLeave={() => setOverIdx(null)}
              onDrop={() => handleDropRow(idx)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, marginBottom: 4,
                border: overIdx === idx ? "2px solid #2563eb" : "1px solid #e5e7eb",
                background: draggingIdx === idx ? "#f0f7ff" : "white",
                cursor: "grab",
              }}
            >
              <span style={{ color: "#9ca3af", cursor: "grab", fontSize: 16, flexShrink: 0 }}>⠿</span>

              {/* Color picker nativo */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: stage.color, border: "2px solid #e5e7eb", cursor: "pointer", overflow: "hidden", position: "relative" }}>
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => setLocal(local.map((s, i) => i === idx ? { ...s, color: e.target.value } : s))}
                    style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer", padding: 0, border: "none" }}
                  />
                </div>
              </div>

              {/* Name */}
              <input
                value={stage.name}
                onChange={(e) => setLocal(local.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                style={{ flex: 1, minWidth: 0, border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 13 }}
              />

              {/* Agent selector */}
              <select
                value={stage.agent_id ?? ""}
                onChange={(e) => setLocal(local.map((s, i) => i === idx ? { ...s, agent_id: e.target.value || null } : s))}
                title="Agente IA para esta etapa"
                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 6px", fontSize: 12, color: stage.agent_id ? "#111827" : "#9ca3af", width: 120, flexShrink: 0, cursor: "pointer" }}
              >
                <option value="">Sin agente</option>
                {aiAgents.map((a) => (
                  <option key={a.id} value={a.id}>🤖 {a.name}</option>
                ))}
              </select>

              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", flexShrink: 0 }}>{stageConvCount(stage.id)} conv.</span>

              <button
                onClick={() => { setDeleteIdx(idx); setDeleteMoveTarget(local.find((_, i) => i !== idx)?.id ?? "") }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", flexShrink: 0, padding: "0 2px", display: "flex", alignItems: "center" }}
                title="Eliminar etapa"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            </div>
          ))}

          {/* Delete confirmation */}
          {deleteIdx !== null && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, marginTop: 8 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, color: "#991b1b" }}>
                <strong>¿Eliminar "{local[deleteIdx]?.name}"?</strong>{" "}
                {stageConvCount(local[deleteIdx]?.id)} conversaciones serán movidas a:
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={deleteMoveTarget} onChange={(e) => setDeleteMoveTarget(e.target.value)} style={{ ...filterInput, flex: 1 }}>
                  {local.filter((_, i) => i !== deleteIdx).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={confirmDelete} style={{ ...primaryBtn, background: "#ef4444", fontSize: 12 }}>Confirmar</button>
                <button onClick={() => setDeleteIdx(null)} style={{ ...outlineBtn, fontSize: 12 }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Add new stage */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #f3f4f6", display: "flex", gap: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addStage()}
            placeholder="Nueva etapa…"
            style={{ ...filterInput, flex: 1 }}
          />
          <button onClick={addStage} style={primaryBtn}>+ Agregar</button>
        </div>

        <div style={{ padding: "10px 16px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid #e5e7eb" }}>
          <button onClick={onClose} style={outlineBtn}>Cancelar</button>
          <button onClick={() => { onSave(local); onClose() }} style={primaryBtn}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#9ca3af", padding: 40 }}>
      <span style={{ fontSize: 52 }}>💬</span>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No hay conversaciones que coincidan con los filtros</p>
      <p style={{ margin: 0, fontSize: 13 }}>Intenta cambiar los filtros o la búsqueda</p>
    </div>
  )
}

// ─── Hook Supabase ────────────────────────────────────────────────────────────

type DbAgent = { id: string; name: string; active: boolean }

function useEmbudoData() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts, setContacts]           = useState<MockContact[]>([])
  const [stages, setStages]               = useState<StageConfig[]>(DEFAULT_STAGES)
  const [aiAgents, setAiAgents]           = useState<DbAgent[]>([])
  const [loading, setLoading]             = useState(true)

  const loadStages = useCallback(async () => {
    const { data } = await supabase
      .from("pipeline_stages")
      .select("id, name, color, agent_id, position")
      .order("position", { ascending: true })
    if (data && data.length > 0) {
      setStages(data.map((s) => ({ id: s.id, name: s.name, color: s.color ?? "#6b7280", agent_id: s.agent_id ?? null })))
    }
  }, [])

  const loadAgents = useCallback(async () => {
    const { data } = await supabase.from("agents").select("id, name, active").eq("active", true).order("created_at")
    setAiAgents(data ?? [])
  }, [])

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contacts(id, name, phone, email, company, status, created_at)")
      .eq("status", "open")
      .order("last_activity", { ascending: false })

    if (error) { console.error("[embudo]", error.message); return }

    const convs: Conversation[] = []
    const ctcts: MockContact[]  = []
    const seen = new Set<string>()

    for (const row of data ?? []) {
      convs.push({
        id:              row.id,
        contactId:       row.contact_id,
        channel:         (row.channel as Conversation["channel"]) ?? "whatsapp",
        botStatus:       row.mode === "bot" ? "bot" : "human",
        assignedAgentId: row.assigned_agent ?? null,
        pipelineStage:   (row.pipeline_stage as Conversation["pipelineStage"]) ?? "Nuevo contacto",
        unreadCount:     row.unread_count ?? 0,
        lastMessage:     row.last_message ?? "",
        lastActivityAt:  row.last_activity,
        tags:            [],
      })
      if (row.contacts && !seen.has(row.contact_id)) {
        const c = row.contacts as { id: string; name: string; phone: string | null; created_at: string }
        ctcts.push({ id: c.id, name: c.name, phone: c.phone ?? undefined, channels: ["whatsapp"], createdAt: c.created_at, totalConversations: 1 })
        seen.add(row.contact_id)
      }
    }
    setConversations(convs)
    setContacts(ctcts)
    setLoading(false)
  }, [])

  async function saveStages(newStages: StageConfig[]) {
    // Upsert todas las etapas con su posición y agent_id
    const rows = newStages.map((s, i) => ({
      id:       s.id,
      name:     s.name,
      color:    s.color,
      agent_id: s.agent_id ?? null,
      position: i,
    }))
    await supabase.from("pipeline_stages").upsert(rows, { onConflict: "id" })
    setStages(newStages)
  }

  async function updateConversation(id: string, updates: { pipeline_stage?: string; assigned_agent?: string | null }) {
    await supabase.from("conversations").update(updates).eq("id", id)
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      return {
        ...c,
        ...(updates.pipeline_stage && { pipelineStage: updates.pipeline_stage as Conversation["pipelineStage"] }),
        ...(updates.assigned_agent !== undefined && { assignedAgentId: updates.assigned_agent }),
      }
    }))
  }

  useEffect(() => {
    load()
    loadStages()
    loadAgents()
    const ch = supabase.channel("embudo-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, loadStages, loadAgents])

  return { conversations, contacts, stages, aiAgents, loading, updateConversation, setConversations, saveStages }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmbudoPage() {
  const router = useRouter()
  const { conversations, contacts, stages, aiAgents, loading, updateConversation, setConversations, saveStages } = useEmbudoData()
  const [view, setView] = useState<"lista" | "embudo">("embudo")
  const [showStageManager, setShowStageManager] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    search: "", channel: "all", agentId: "all", stages: [], status: "all",
  })

  const filtered = useFilteredConversations(conversations, contacts, filters)

  async function onUpdate(updated: Conversation) {
    await updateConversation(updated.id, {
      pipeline_stage: updated.pipelineStage,
      assigned_agent: updated.assignedAgentId,
    })
  }

  function onOpen(convId: string) {
    router.push(`/dashboard/soporte?conv=${convId}`)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>
      <TopBar
        view={view}
        setView={setView}
        filters={filters}
        setFilters={setFilters}
        total={filtered.length}
        showStageManager={showStageManager}
        setShowStageManager={setShowStageManager}
      />

      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
            Cargando conversaciones…
          </div>
        ) : view === "lista" ? (
          <ListView conversations={filtered} contacts={contacts} onUpdate={onUpdate} onOpen={onOpen} />
        ) : (
          <EmbudoView conversations={filtered} contacts={contacts} stages={stages} onUpdate={onUpdate} onOpen={onOpen} />
        )}
      </div>

      {showStageManager && (
        <StageManagerModal
          stages={stages}
          conversations={conversations}
          aiAgents={aiAgents}
          onSave={(s) => saveStages(s)}
          onClose={() => setShowStageManager(false)}
        />
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const filterInput: React.CSSProperties = {
  padding: "6px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb",
  background: "white", outline: "none", cursor: "pointer",
}
const primaryBtn: React.CSSProperties = {
  padding: "7px 14px", fontSize: 13, borderRadius: 8, border: "none",
  background: "#111827", color: "white", cursor: "pointer", fontWeight: 500,
}
const outlineBtn: React.CSSProperties = {
  padding: "7px 14px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb",
  background: "white", color: "#374151", cursor: "pointer",
}
const th: React.CSSProperties = {
  padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
}
const td: React.CSSProperties = {
  padding: "10px 12px", fontSize: 13, verticalAlign: "middle",
}

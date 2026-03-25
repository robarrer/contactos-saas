"use client"

import { useEffect, useState, useCallback } from "react"

// ─── Types ─────────────────────────────────────────────────────────────────────

type MetaTemplate = {
  name: string
  status: string
  category: string
  language: string | { code?: string }
  components?: Array<{
    type: string
    text?: string | { body?: string }
    format?: { type: string }
    buttons?: Array<{ type: string; text?: string; url?: string }>
  }>
}

type TemplateLog = {
  id: string
  created_at: string
  status: string
  template_name: string
  content: string
  wa_message_id: string | null
  contact_phone: string
  contact_name: string | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getComponentText(comp: { text?: string | { body?: string } } | undefined): string {
  if (!comp?.text) return ""
  return typeof comp.text === "string" ? comp.text : comp.text?.body ?? ""
}

function findComponent(template: MetaTemplate, type: string) {
  const upper = type.toUpperCase()
  return template.components?.find((c) => c.type.toUpperCase() === upper)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

// ─── Constantes ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  APPROVED: { bg: "#d1fae5", color: "#065f46", label: "Aprobada" },
  PENDING:  { bg: "#fef3c7", color: "#92400e", label: "Pendiente" },
  REJECTED: { bg: "#fee2e2", color: "#991b1b", label: "Rechazada" },
  PAUSED:   { bg: "#e0e7ff", color: "#3730a3", label: "Pausada" },
}

const STATUS_SEND: Record<string, { bg: string; color: string; label: string }> = {
  sent:      { bg: "#dbeafe", color: "#1e40af", label: "Enviado" },
  delivered: { bg: "#d1fae5", color: "#065f46", label: "Entregado" },
  read:      { bg: "#ede9fe", color: "#5b21b6", label: "Leído" },
  failed:    { bg: "#fee2e2", color: "#991b1b", label: "Fallido" },
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pendiente" },
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING:      "Marketing",
  UTILITY:        "Utilidad",
  AUTHENTICATION: "Autenticación",
  TRANSACTIONAL:  "Transaccional",
}

const STATUS_SEND_OPTIONS = [
  { value: "",          label: "Todos los estados" },
  { value: "sent",      label: "Enviado" },
  { value: "delivered", label: "Entregado" },
  { value: "read",      label: "Leído" },
  { value: "failed",    label: "Fallido" },
]

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PlantillasPage() {
  const [activeTab, setActiveTab] = useState<"plantillas" | "logs">("plantillas")

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "0 24px", display: "flex", alignItems: "stretch", gap: 0 }}>
        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827", paddingRight: 24, display: "flex", alignItems: "center" }}>
          Plantillas
        </h1>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <TabButton active={activeTab === "plantillas"} onClick={() => setActiveTab("plantillas")}>
            Catálogo
          </TabButton>
          <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
            Logs de envío
          </TabButton>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === "plantillas" ? <PlantillasTab /> : <LogsTab />}
      </div>
    </div>
  )
}

// ─── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "0 18px",
        height: "100%",
        minHeight: 46,
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "#2563eb" : "#6b7280",
        transition: "color 120ms, border-color 120ms",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  )
}

// ─── Tab: Catálogo de plantillas ───────────────────────────────────────────────

function PlantillasTab() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState("")
  const [previewTemplate, setPreviewTemplate] = useState<MetaTemplate | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res  = await fetch("/API/list-templates")
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(data?.error ?? "Error al cargar plantillas"); setTemplates([]); return }
        setTemplates(data?.templates ?? [])
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error de conexión"); setTemplates([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!previewTemplate) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewTemplate(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [previewTemplate])

  const filtered = templates.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
  })

  function getBodyPreview(t: MetaTemplate): string {
    const body = getComponentText(findComponent(t, "BODY"))
    return body ? body.slice(0, 100) + (body.length > 100 ? "…" : "") : "—"
  }

  return (
    <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>

      {/* Search bar */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid #f3f4f6", background: "white" }}>
        <div style={{ position: "relative", maxWidth: 320 }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plantilla…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
          Cargando plantillas…
        </div>
      )}
      {error && (
        <div style={{ margin: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#991b1b", fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 8 }}>
          <span style={{ fontSize: 36 }}>📋</span>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
            {search ? "No hay plantillas que coincidan" : "No hay plantillas aprobadas en esta cuenta"}
          </p>
          {!search && (
            <p style={{ margin: 0, fontSize: 12 }}>Verifica que WHATSAPP_TOKEN y WHATSAPP_BUSINESS_ACCOUNT_ID estén configurados</p>
          )}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <>
          <div style={{ padding: "8px 24px", background: "#f9fafb" }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>{filtered.length} {filtered.length === 1 ? "plantilla" : "plantillas"}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>Nombre</th>
                <th style={th}>Cuerpo</th>
                <th style={th}>Estado</th>
                <th style={th}>Categoría</th>
                <th style={th}>Idioma</th>
                <th style={{ ...th, textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const st   = STATUS_META[t.status] ?? { bg: "#f3f4f6", color: "#374151", label: t.status }
                const lang = typeof t.language === "string" ? t.language : t.language?.code ?? "—"
                const cat  = CATEGORY_LABELS[t.category] ?? t.category
                return (
                  <tr
                    key={t.name}
                    style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa", cursor: "pointer", transition: "background 100ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "white" : "#fafafa")}
                    onClick={() => setPreviewTemplate(t)}
                  >
                    <td style={td}><span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{t.name}</span></td>
                    <td style={{ ...td, maxWidth: 320 }}>
                      <span style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {getBodyPreview(t)}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={td}><span style={{ fontSize: 13, color: "#374151" }}>{cat}</span></td>
                    <td style={td}><span style={{ fontSize: 13, color: "#374151", textTransform: "uppercase" }}>{lang}</span></td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setPreviewTemplate(t) }}
                        style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#374151", whiteSpace: "nowrap" }}
                      >
                        Vista previa
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {previewTemplate && (
        <TemplatePreviewModal template={previewTemplate} onClose={() => setPreviewTemplate(null)} />
      )}
    </div>
  )
}

// ─── Tab: Logs de envío ────────────────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs]           = useState<TemplateLog[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [statusFilter, setStatusFilter]     = useState("")
  const [templateFilter, setTemplateFilter] = useState("")
  const [contactFilter, setContactFilter]   = useState("")
  const [expandedError, setExpandedError]   = useState<string | null>(null)

  const LIMIT = 50

  const load = useCallback(async (p: number, sf: string, tf: string, cf: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      if (sf) params.set("status",   sf)
      if (tf) params.set("template", tf)
      if (cf) params.set("contact",  cf)
      const res  = await fetch(`/API/template-logs?${params}`)
      const data = await res.json()
      if (!res.ok) { setError(data?.error ?? "Error al cargar logs"); return }
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, statusFilter, templateFilter, contactFilter) }, [load, page, statusFilter, templateFilter, contactFilter])

  function applyFilters() {
    setPage(1)
    load(1, statusFilter, templateFilter, contactFilter)
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  // Contadores por status
  const counts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Filters bar */}
      <div style={{ padding: "12px 24px", background: "white", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Búsqueda por plantilla */}
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters() }}
            placeholder="Nombre de plantilla…"
            style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", width: 190 }}
          />
        </div>

        {/* Búsqueda por paciente o teléfono */}
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <input
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters() }}
            placeholder="Paciente o teléfono…"
            style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", width: 190 }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#374151", outline: "none", cursor: "pointer" }}
        >
          {STATUS_SEND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={applyFilters}
          style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151" }}
        >
          Buscar
        </button>

        <button
          type="button"
          onClick={() => { setStatusFilter(""); setTemplateFilter(""); setContactFilter(""); setPage(1) }}
          style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#6b7280" }}
        >
          Limpiar
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => load(page, statusFilter, templateFilter, contactFilter)}
            title="Actualizar"
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#374151" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && logs.length > 0 && (
        <div style={{ padding: "8px 24px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}><b style={{ color: "#111827" }}>{total}</b> registros en total</span>
          {Object.entries(counts).map(([st, n]) => {
            const s = STATUS_SEND[st] ?? { bg: "#f3f4f6", color: "#374151", label: st }
            return (
              <span key={st} style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: s.bg, color: s.color, fontWeight: 600 }}>
                {s.label}: {n}
              </span>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
            Cargando logs…
          </div>
        )}

        {error && (
          <div style={{ margin: 20, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#991b1b", fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && !error && logs.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 8 }}>
            <span style={{ fontSize: 36 }}>📬</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>No hay registros de envío aún</p>
            <p style={{ margin: 0, fontSize: 12 }}>Los envíos de plantillas desde Contactos aparecerán aquí</p>
          </div>
        )}

        {!loading && logs.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 0 }}>
                <th style={th}>Fecha y hora</th>
                <th style={th}>Plantilla</th>
                <th style={th}>Contacto</th>
                <th style={th}>Teléfono</th>
                <th style={th}>Estado</th>
                <th style={th}>Detalle / Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => {
                const st = STATUS_SEND[log.status] ?? { bg: "#f3f4f6", color: "#374151", label: log.status }
                const isFailed = log.status === "failed"
                const isExpanded = expandedError === log.id
                return (
                  <tr
                    key={log.id}
                    style={{ borderBottom: "1px solid #f3f4f6", background: isFailed ? "#fff8f8" : (i % 2 === 0 ? "white" : "#fafafa") }}
                  >
                    <td style={{ ...td, whiteSpace: "nowrap", color: "#6b7280" }}>
                      {formatDate(log.created_at)}
                    </td>
                    <td style={td}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{log.template_name}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 13, color: "#374151" }}>
                        {log.contact_name ?? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Sin nombre</span>}
                      </span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "monospace" }}>{log.contact_phone}</span>
                    </td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
                        {isFailed && <span style={{ marginRight: 4 }}>⚠</span>}
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      {isFailed ? (
                        <div>
                          <div
                            style={{ fontSize: 12, color: "#991b1b", overflow: "hidden", display: isExpanded ? "block" : "-webkit-box", WebkitLineClamp: isExpanded ? undefined : 2, WebkitBoxOrient: "vertical", wordBreak: "break-word", whiteSpace: "pre-wrap" }}
                          >
                            {log.content}
                          </div>
                          {log.content && log.content.length > 80 && (
                            <button
                              type="button"
                              onClick={() => setExpandedError(isExpanded ? null : log.id)}
                              style={{ marginTop: 2, fontSize: 11, color: "#2563eb", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            >
                              {isExpanded ? "Ver menos" : "Ver más"}
                            </button>
                          )}
                        </div>
                      ) : (
                        log.wa_message_id ? (
                          <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                            {log.wa_message_id}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#d1d5db" }}>—</span>
                        )
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: "12px 24px", background: "white", borderTop: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Página {page} de {totalPages} · {total} registros
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: page <= 1 ? "#f9fafb" : "white", cursor: page <= 1 ? "default" : "pointer", fontSize: 13, color: page <= 1 ? "#d1d5db" : "#374151" }}
            >
              ← Anterior
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: page >= totalPages ? "#f9fafb" : "white", cursor: page >= totalPages ? "default" : "pointer", fontSize: 13, color: page >= totalPages ? "#d1d5db" : "#374151" }}
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Shared styles ─────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
  background: "#f9fafb",
}

const td: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: 13,
  verticalAlign: "middle",
}

// ─── Variable highlight ────────────────────────────────────────────────────────

function TemplateTextWithVariables({ text, baseStyle }: { text: string; baseStyle?: React.CSSProperties }) {
  const parts: React.ReactNode[] = []
  const re = /\{\{(\d+)\}\}/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    parts.push(
      <span key={`${m[0]}-${m.index}`} style={{ display: "inline", padding: "2px 6px", margin: "0 2px", borderRadius: 6, background: "#dbeafe", color: "#1e40af", fontSize: "0.95em", fontWeight: 600 }} title={`Variable ${m[1]}`}>
        {m[0]}
      </span>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <span style={{ ...baseStyle, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{parts.length ? parts : text}</span>
}

// ─── Preview Modal ─────────────────────────────────────────────────────────────

function TemplatePreviewModal({ template, onClose }: { template: MetaTemplate; onClose: () => void }) {
  const headerComp  = findComponent(template, "HEADER")
  const bodyComp    = findComponent(template, "BODY")
  const footerComp  = findComponent(template, "FOOTER")
  const buttonsComp = findComponent(template, "BUTTONS")
  const lang        = typeof template.language === "string" ? template.language : template.language?.code ?? ""
  const headerText  = getComponentText(headerComp)
  const bodyText    = getComponentText(bodyComp)
  const footerText  = getComponentText(footerComp)
  const hasText     = headerText || bodyText || footerText
  const st          = STATUS_META[template.status] ?? { bg: "#f3f4f6", color: "#374151", label: template.status }
  const cat         = CATEGORY_LABELS[template.category] ?? template.category

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: "min(500px, 100%)", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>{template.name}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: st.bg, color: st.color }}>{st.label}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>{cat} · {lang.toUpperCase()}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Vista previa del mensaje</p>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 16px", fontFamily: "system-ui, sans-serif" }}>
            {headerText && (
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: "#166534", lineHeight: 1.5 }}>
                <TemplateTextWithVariables text={headerText} />
              </div>
            )}
            {bodyText && (
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                <TemplateTextWithVariables text={bodyText} />
              </div>
            )}
            {footerText && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                <TemplateTextWithVariables text={footerText} />
              </div>
            )}
            {!hasText && (
              <span style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>Esta plantilla no incluye texto en la respuesta de Meta.</span>
            )}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6, borderTop: "1px solid #bbf7d0", paddingTop: 10 }}>
                {buttonsComp.buttons.map((btn, i) => (
                  <span key={i} style={{ padding: "5px 12px", borderRadius: 8, background: "white", border: "1px solid #86efac", fontSize: 13, color: "#166534" }}>
                    {btn.text ?? btn.url ?? btn.type}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

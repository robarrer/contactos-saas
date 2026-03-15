"use client"

import { useEffect, useState } from "react"

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

function getComponentText(comp: { text?: string | { body?: string } } | undefined): string {
  if (!comp?.text) return ""
  return typeof comp.text === "string" ? comp.text : comp.text?.body ?? ""
}

function findComponent(template: MetaTemplate, type: string) {
  const upper = type.toUpperCase()
  return template.components?.find((c) => c.type.toUpperCase() === upper)
}

const STATUS_META: Record<string, { bg: string; color: string; label: string }> = {
  APPROVED: { bg: "#d1fae5", color: "#065f46", label: "Aprobada" },
  PENDING:  { bg: "#fef3c7", color: "#92400e", label: "Pendiente" },
  REJECTED: { bg: "#fee2e2", color: "#991b1b", label: "Rechazada" },
  PAUSED:   { bg: "#e0e7ff", color: "#3730a3", label: "Pausada" },
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING:       "Marketing",
  UTILITY:         "Utilidad",
  AUTHENTICATION:  "Autenticación",
  TRANSACTIONAL:   "Transaccional",
}

export default function PlantillasPage() {
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: "0 0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Plantillas</h1>
          {!loading && (
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400 }}>
              {filtered.length} {filtered.length === 1 ? "plantilla" : "plantillas"}
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plantilla…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto" }}>

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
            <span style={{ fontSize: 40 }}>📋</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
              {search ? "No hay plantillas que coincidan con la búsqueda" : "No hay plantillas aprobadas en esta cuenta"}
            </p>
            {!search && (
              <p style={{ margin: 0, fontSize: 12 }}>Verifica que WHATSAPP_TOKEN y WHATSAPP_BUSINESS_ACCOUNT_ID estén configurados</p>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
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
                const st = STATUS_META[t.status] ?? { bg: "#f3f4f6", color: "#374151", label: t.status }
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
                    <td style={td}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{t.name}</span>
                    </td>
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
                    <td style={td}>
                      <span style={{ fontSize: 13, color: "#374151" }}>{cat}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 13, color: "#374151", textTransform: "uppercase" }}>{lang}</span>
                    </td>
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
        )}
      </div>

      {/* ── Modal preview ── */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
}

const td: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: 13,
  verticalAlign: "middle",
}

// ─── Variable highlight ───────────────────────────────────────────────────────

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

// ─── Preview Modal ────────────────────────────────────────────────────────────

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: "min(500px, 100%)", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>

        {/* Header */}
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

        {/* WhatsApp bubble preview */}
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

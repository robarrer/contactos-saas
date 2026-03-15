"use client"

import { useEffect, useState } from "react"

type MetaTemplate = {
  name: string
  status: string
  category: string
  language: string | { code?: string }
  components?: Array<{
    type: string
    /** Meta puede devolver texto en "text" (string) o en "text.body" */
    text?: string | { body?: string }
    format?: { type: string }
    buttons?: Array<{ type: string; text?: string; url?: string }>
  }>
}

type ApiResponse = {
  templates?: MetaTemplate[]
  paging?: { next?: string; previous?: string }
}

/** Extrae el texto de un componente (Meta devuelve text como string o como { body }). */
function getComponentText(comp: { text?: string | { body?: string } } | undefined): string {
  if (!comp?.text) return ""
  return typeof comp.text === "string" ? comp.text : comp.text?.body ?? ""
}

function findComponent(template: MetaTemplate, type: string) {
  const upper = type.toUpperCase()
  return template.components?.find((c) => c.type.toUpperCase() === upper)
}

export default function PlantillasPage() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewTemplate, setPreviewTemplate] = useState<MetaTemplate | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/API/list-templates")
        const data: ApiResponse & { error?: string } = await res.json()

        if (cancelled) return

        if (!res.ok) {
          setError(data?.error ?? "Error al cargar plantillas")
          setTemplates([])
          return
        }

        setTemplates(data?.templates ?? [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error de conexión")
          setTemplates([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function getBodyPreview(t: MetaTemplate): string {
    const body = getComponentText(findComponent(t, "BODY"))
    if (body) return body.slice(0, 120) + (body.length > 120 ? "…" : "")
    return "—"
  }

  useEffect(() => {
    if (!previewTemplate) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreviewTemplate(null)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [previewTemplate])

  return (
    <div>
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1 style={{ margin: 0 }}>Plantillas</h1>
        <span style={{ fontSize: 14, color: "#6b7280" }}>
          Plantillas de WhatsApp (Meta)
        </span>
      </div>

      {loading && (
        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: 24,
            textAlign: "center",
            color: "#6b7280",
          }}
        >
          Cargando plantillas…
        </div>
      )}

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: 16,
            color: "#991b1b",
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && templates.length === 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: 24,
          }}
        >
          <p style={{ margin: 0, color: "#6b7280" }}>
            No hay plantillas aprobadas en esta cuenta o faltan variables de
            entorno (WHATSAPP_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID).
          </p>
        </div>
      )}

      {!loading && templates.length > 0 && (
        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th style={thStyle}>Nombre</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}>Categoría</th>
                <th style={thStyle}>Idioma</th>
                <th style={thStyle}>Vista previa</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.name}>
                  <td style={tdStyle}>
                    <strong>{t.name}</strong>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: 8,
                        fontSize: 12,
                        background:
                          t.status === "APPROVED"
                            ? "#dcfce7"
                            : t.status === "PENDING"
                              ? "#fef9c3"
                              : "#fee2e2",
                        color:
                          t.status === "APPROVED"
                            ? "#166534"
                            : t.status === "PENDING"
                              ? "#854d0e"
                              : "#991b1b",
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{t.category}</td>
                  <td style={tdStyle}>
                    {typeof t.language === "string"
                      ? t.language
                      : t.language?.code ?? "—"}
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(t)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #d1d5db",
                        background: "#f9fafb",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      Vista previa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  borderBottom: "1px solid #e5e7eb",
  background: "#f9fafb",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
}

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #f3f4f6",
}

/** Renderiza un texto de plantilla mostrando {{1}}, {{2}}, etc. como variables resaltadas */
function TemplateTextWithVariables({ text, baseStyle }: { text: string; baseStyle?: React.CSSProperties }) {
  const parts: React.ReactNode[] = []
  const re = /\{\{(\d+)\}\}/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index))
    }
    parts.push(
      <span
        key={m[0]}
        style={{
          display: "inline",
          padding: "2px 6px",
          margin: "0 2px",
          borderRadius: 6,
          background: "#dbeafe",
          color: "#1e40af",
          fontSize: "0.95em",
          fontWeight: 600,
        }}
        title={`Variable ${m[1]}`}
      >
        {m[0]}
      </span>
    )
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return (
    <span style={{ ...baseStyle, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {parts.length ? parts : text}
    </span>
  )
}

function TemplatePreviewModal({
  template,
  onClose,
}: {
  template: MetaTemplate
  onClose: () => void
}) {
  const headerComp = findComponent(template, "HEADER")
  const bodyComp = findComponent(template, "BODY")
  const footerComp = findComponent(template, "FOOTER")
  const buttonsComp = findComponent(template, "BUTTONS")
  const lang = typeof template.language === "string" ? template.language : template.language?.code ?? ""

  const headerText = getComponentText(headerComp)
  const bodyText = getComponentText(bodyComp)
  const footerText = getComponentText(footerComp)
  const hasAnyText = headerText !== "" || bodyText !== "" || footerText !== ""

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa: ${template.name}`}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 39, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: "min(480px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "white",
          borderRadius: 14,
          border: "1px solid #e5e7eb",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>Vista previa: {template.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: "32px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 12, fontSize: 12, color: "#6b7280" }}>
            {template.category} · {lang}
          </div>

          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: 16,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {headerText !== "" && (
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                  fontSize: 15,
                  color: "#166534",
                  lineHeight: 1.5,
                }}
              >
                <TemplateTextWithVariables text={headerText} />
              </div>
            )}
            {bodyText !== "" && (
              <div
                style={{
                  fontSize: 14,
                  color: "#374151",
                  lineHeight: 1.6,
                }}
              >
                <TemplateTextWithVariables text={bodyText} />
              </div>
            )}
            {footerText !== "" && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: 1.5,
                }}
              >
                <TemplateTextWithVariables text={footerText} />
              </div>
            )}
            {!hasAnyText && (
              <div style={{ fontSize: 14, color: "#6b7280", fontStyle: "italic" }}>
                Esta plantilla no incluye texto en la respuesta de Meta (solo nombre/categoría/idioma).
              </div>
            )}
            {buttonsComp?.buttons && buttonsComp.buttons.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {buttonsComp.buttons.map((btn, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: "white",
                      border: "1px solid #86efac",
                      fontSize: 13,
                      color: "#166534",
                    }}
                  >
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

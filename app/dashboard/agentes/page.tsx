"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Agent = {
  id?: string
  name: string
  description: string
  instructions: string
  active: boolean
  llm_provider: "openai" | "anthropic"
  llm_model: string
  created_at?: string
}

type ToolParam = {
  name: string
  type: string
  description: string
  required: boolean
  in: "query" | "body" | "path"
}

type AgentTool = {
  id?: string
  agent_id: string
  name: string
  description: string
  enabled: boolean
  http_method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  headers: Record<string, string>
  parameters: ToolParam[]
  created_at?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MODELS: Record<"openai" | "anthropic", { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o",      label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o mini (económico)" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022",  label: "Claude 3.5 Haiku (económico)" },
    { id: "claude-3-opus-20240229",     label: "Claude 3 Opus" },
  ],
}

const EMPTY_AGENT: Agent = {
  name: "", description: "", instructions: "", active: true,
  llm_provider: "openai", llm_model: "gpt-4o-mini",
}

const EMPTY_TOOL = (agentId: string): AgentTool => ({
  agent_id: agentId,
  name: "", description: "", enabled: true,
  http_method: "GET", url: "", headers: {}, parameters: [],
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
}

const AVATAR_COLORS = [
  "#7c3aed","#0891b2","#059669","#d97706","#dc2626",
  "#6366f1","#0d9488","#b45309","#9333ea","#0369a1",
]
function avatarColor(id: string) {
  let n = 0; for (const c of id) n += c.charCodeAt(0)
  return AVATAR_COLORS[n % AVATAR_COLORS.length]
}

function relativeDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
}

function methodColor(method: string) {
  const map: Record<string, { bg: string; text: string }> = {
    GET:    { bg: "#dbeafe", text: "#1d4ed8" },
    POST:   { bg: "#d1fae5", text: "#065f46" },
    PUT:    { bg: "#fef3c7", text: "#92400e" },
    PATCH:  { bg: "#ede9fe", text: "#5b21b6" },
    DELETE: { bg: "#fee2e2", text: "#991b1b" },
  }
  return map[method] ?? { bg: "#f3f4f6", text: "#374151" }
}

// ─── ToolForm ─────────────────────────────────────────────────────────────────

function ToolForm({
  tool, onSave, onCancel, saving,
}: {
  tool: AgentTool
  onSave: (t: AgentTool) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<AgentTool>(tool)
  const [headerPairs, setHeaderPairs] = useState<{ key: string; value: string }[]>(
    Object.entries(tool.headers || {}).map(([key, value]) => ({ key, value }))
  )

  function upd(patch: Partial<AgentTool>) { setForm((prev) => ({ ...prev, ...patch })) }
  function updParam(i: number, patch: Partial<ToolParam>) {
    upd({ parameters: form.parameters.map((p, idx) => idx === i ? { ...p, ...patch } : p) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.url.trim()) return
    const headers: Record<string, string> = {}
    headerPairs.forEach((p) => { if (p.key.trim()) headers[p.key.trim()] = p.value })
    await onSave({ ...form, headers })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Back */}
      <button
        type="button" onClick={onCancel}
        style={{ ...secondaryBtn, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
      >
        ← Volver
      </button>

      {/* Nombre */}
      <div>
        <label style={labelStyle}>Nombre de la función <span style={{ color: "#ef4444" }}>*</span></label>
        <input
          type="text" placeholder="Ej: buscar_disponibilidad"
          value={form.name}
          onChange={(e) => upd({ name: e.target.value.replace(/[\s-]+/g, "_").toLowerCase() })}
          style={inputStyle} required autoFocus
        />
        <p style={hintStyle}>Solo minúsculas, números y guiones bajos. El LLM usa este nombre para identificar la función.</p>
      </div>

      {/* Descripción */}
      <div>
        <label style={labelStyle}>Descripción <span style={{ color: "#ef4444" }}>*</span></label>
        <textarea
          placeholder="Ej: Consulta los horarios disponibles en el sistema de agendamiento para una fecha y profesional específicos"
          value={form.description}
          onChange={(e) => upd({ description: e.target.value })}
          style={{ ...inputStyle, minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
          required
        />
        <p style={hintStyle}>El LLM lee esto para decidir cuándo llamar esta función. Sé específico sobre qué hace y cuándo usarla.</p>
      </div>

      {/* Método + URL */}
      <div>
        <label style={labelStyle}>Endpoint <span style={{ color: "#ef4444" }}>*</span></label>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={form.http_method}
            onChange={(e) => upd({ http_method: e.target.value as AgentTool["http_method"] })}
            style={{ ...inputStyle, width: "auto", flexShrink: 0 }}
          >
            {["GET","POST","PUT","PATCH","DELETE"].map((m) => <option key={m}>{m}</option>)}
          </select>
          <input
            type="text" placeholder="https://api.ejemplo.com/disponibilidad"
            value={form.url}
            onChange={(e) => upd({ url: e.target.value })}
            style={{ ...inputStyle, flex: 1 }}
            required
          />
        </div>
        <p style={hintStyle}>Usa {"{{"+"variable"+"}}"} para parámetros de ruta. Ej: https://api.com/pacientes/{"{{"+"id"+"}}"}.</p>
      </div>

      {/* Headers */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Headers</label>
          <button
            type="button"
            onClick={() => setHeaderPairs((prev) => [...prev, { key: "", value: "" }])}
            style={{ ...secondaryBtn, fontSize: 12, padding: "4px 10px" }}
          >
            + Agregar
          </button>
        </div>
        {headerPairs.length === 0 ? (
          <p style={{ ...hintStyle, marginTop: 0 }}>Sin headers. Agrega uno para API keys, tokens de autorización, etc.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {headerPairs.map((pair, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input
                  placeholder="Clave (ej: Authorization)"
                  value={pair.key}
                  onChange={(e) => setHeaderPairs((prev) => prev.map((p, idx) => idx === i ? { ...p, key: e.target.value } : p))}
                  style={{ ...inputStyle, flex: "0 0 42%", fontSize: 12 }}
                />
                <input
                  placeholder="Valor (ej: Bearer TOKEN)"
                  value={pair.value}
                  onChange={(e) => setHeaderPairs((prev) => prev.map((p, idx) => idx === i ? { ...p, value: e.target.value } : p))}
                  style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                />
                <button
                  type="button"
                  onClick={() => setHeaderPairs((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ ...iconBtn, color: "#ef4444", flexShrink: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parámetros */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Parámetros</label>
          <button
            type="button"
            onClick={() => upd({ parameters: [...(form.parameters || []), { name: "", type: "string", description: "", required: false, in: "query" }] })}
            style={{ ...secondaryBtn, fontSize: 12, padding: "4px 10px" }}
          >
            + Agregar
          </button>
        </div>
        {(form.parameters || []).length === 0 ? (
          <p style={{ ...hintStyle, marginTop: 0 }}>Sin parámetros. Son los datos que el LLM extrae de la conversación y envía a la API.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.parameters.map((param, i) => (
              <div key={i} style={{ background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    placeholder="nombre (ej: fecha)"
                    value={param.name}
                    onChange={(e) => updParam(i, { name: e.target.value.replace(/[\s-]+/g, "_").toLowerCase() })}
                    style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                  />
                  <select
                    value={param.type}
                    onChange={(e) => updParam(i, { type: e.target.value })}
                    style={{ ...inputStyle, width: "auto", fontSize: 12 }}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <select
                    value={param.in}
                    onChange={(e) => updParam(i, { in: e.target.value as ToolParam["in"] })}
                    style={{ ...inputStyle, width: "auto", fontSize: 12 }}
                  >
                    <option value="query">query</option>
                    <option value="body">body</option>
                    <option value="path">path</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => upd({ parameters: form.parameters.filter((_, idx) => idx !== i) })}
                    style={{ ...iconBtn, color: "#ef4444", flexShrink: 0 }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <input
                  placeholder="Descripción para el LLM (ej: Fecha de la cita en formato YYYY-MM-DD)"
                  value={param.description}
                  onChange={(e) => updParam(i, { description: e.target.value })}
                  style={{ ...inputStyle, fontSize: 12 }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, color: "#6b7280" }}>
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={(e) => updParam(i, { required: e.target.checked })}
                  />
                  Requerido
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Habilitado */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button" role="switch" aria-checked={form.enabled}
          onClick={() => upd({ enabled: !form.enabled })}
          style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: form.enabled ? "#22c55e" : "#d1d5db",
            position: "relative", transition: "background 200ms", flexShrink: 0,
          }}
        >
          <span style={{
            position: "absolute", top: 3, left: form.enabled ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%", background: "white",
            transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }} />
        </button>
        <span style={{ fontSize: 13, color: "#374151" }}>
          {form.enabled ? "Herramienta habilitada" : "Herramienta deshabilitada"}
        </span>
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
        <button type="button" onClick={onCancel} style={secondaryBtn}>Cancelar</button>
        <button
          type="submit"
          disabled={saving || !form.name.trim() || !form.url.trim()}
          style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Guardando…" : tool.id ? "Guardar cambios" : "Crear herramienta"}
        </button>
      </div>
    </form>
  )
}

// ─── IntegrationsTab ──────────────────────────────────────────────────────────

function IntegrationsTab({ agentId }: { agentId: string }) {
  const [tools, setTools]           = useState<AgentTool[]>([])
  const [loading, setLoading]       = useState(true)
  const [editingTool, setEditingTool] = useState<AgentTool | null>(null)
  const [saving, setSaving]         = useState(false)

  async function loadTools() {
    setLoading(true)
    const { data } = await supabase
      .from("agent_tools")
      .select("*")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true })
    setTools(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadTools() }, [agentId])

  async function saveTool(tool: AgentTool) {
    setSaving(true)
    const payload = {
      agent_id:    tool.agent_id,
      name:        tool.name.trim(),
      description: tool.description.trim(),
      enabled:     tool.enabled,
      http_method: tool.http_method,
      url:         tool.url.trim(),
      headers:     tool.headers,
      parameters:  tool.parameters,
    }
    if (tool.id) {
      await supabase.from("agent_tools").update(payload).eq("id", tool.id)
    } else {
      await supabase.from("agent_tools").insert(payload)
    }
    setSaving(false)
    setEditingTool(null)
    loadTools()
  }

  async function deleteTool(id: string) {
    if (!confirm("¿Eliminar esta herramienta? No se puede deshacer.")) return
    await supabase.from("agent_tools").delete().eq("id", id)
    loadTools()
  }

  async function toggleTool(tool: AgentTool) {
    await supabase.from("agent_tools").update({ enabled: !tool.enabled }).eq("id", tool.id!)
    setTools((prev) => prev.map((t) => t.id === tool.id ? { ...t, enabled: !t.enabled } : t))
  }

  if (editingTool !== null) {
    return (
      <ToolForm
        tool={editingTool}
        onSave={saveTool}
        onCancel={() => setEditingTool(null)}
        saving={saving}
      />
    )
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
          Define funciones que el agente puede ejecutar para consultar o escribir en sistemas externos. El LLM decide cuándo usarlas según la conversación.
        </p>
        <button
          type="button"
          onClick={() => setEditingTool(EMPTY_TOOL(agentId))}
          style={{ ...primaryBtn, flexShrink: 0 }}
        >
          + Agregar
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>
          Cargando herramientas…
        </div>
      ) : tools.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔌</div>
          <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500, color: "#374151" }}>Sin herramientas configuradas</p>
          <p style={{ margin: "0 0 16px", fontSize: 13 }}>Agrega una para que el agente pueda conectarse a APIs externas</p>
          <button type="button" onClick={() => setEditingTool(EMPTY_TOOL(agentId))} style={primaryBtn}>
            Agregar herramienta
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tools.map((tool) => {
            const mc = methodColor(tool.http_method)
            return (
              <div
                key={tool.id}
                style={{
                  background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px",
                  opacity: tool.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  {/* Method badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 5, flexShrink: 0, marginTop: 2,
                    background: mc.bg, color: mc.text,
                  }}>
                    {tool.http_method}
                  </span>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827", marginBottom: 2 }}>
                      {tool.name}
                    </div>
                    {tool.description && (
                      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {tool.description}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {tool.url}
                    </div>
                    {tool.parameters?.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {tool.parameters.map((p) => (
                          <span key={p.name} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#f3f4f6", color: "#6b7280" }}>
                            {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                    <button
                      type="button" role="switch" aria-checked={tool.enabled}
                      onClick={() => toggleTool(tool)}
                      title={tool.enabled ? "Deshabilitar" : "Habilitar"}
                      style={{
                        width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
                        background: tool.enabled ? "#22c55e" : "#d1d5db",
                        position: "relative", transition: "background 200ms", flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: "absolute", top: 2, left: tool.enabled ? 17 : 2,
                        width: 14, height: 14, borderRadius: "50%", background: "white",
                        transition: "left 200ms", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                      }} />
                    </button>
                    <button
                      type="button" onClick={() => setEditingTool(tool)} style={iconBtn} title="Editar"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <button
                      type="button" onClick={() => deleteTool(tool.id!)} style={{ ...iconBtn, color: "#ef4444" }} title="Eliminar"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── AgentPanel ───────────────────────────────────────────────────────────────

function AgentPanel({
  agent, onSave, onClose, saving,
}: {
  agent: Agent
  onSave: (a: Agent) => Promise<void>
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm]         = useState<Agent>(agent)
  const [activeTab, setActiveTab] = useState<"entrenamiento" | "integraciones">("entrenamiento")
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setForm(agent); setActiveTab("entrenamiento") }, [agent])

  function upd(patch: Partial<Agent>) { setForm((prev) => ({ ...prev, ...patch })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    await onSave(form)
  }

  const isNew = !agent.id

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "white", borderLeft: "1px solid #e5e7eb" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isNew && agent.id && (
            <div style={{
              width: 34, height: 34, borderRadius: 8, flexShrink: 0,
              background: avatarColor(agent.id),
              color: "white", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 13, fontWeight: 700,
            }}>
              {initials(agent.name)}
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            {isNew ? "Nuevo agente" : agent.name}
          </h2>
        </div>
        <button type="button" onClick={onClose} style={closeBtn} aria-label="Cerrar">×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", paddingLeft: 20, flexShrink: 0 }}>
        {(["entrenamiento", "integraciones"] as const).map((tab) => (
          <button
            key={tab} type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 16px", fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "#2563eb" : "#6b7280",
              borderBottom: `2px solid ${activeTab === tab ? "#2563eb" : "transparent"}`,
              background: "transparent", border: "none",
              borderBottom: `2px solid ${activeTab === tab ? "#2563eb" : "transparent"}`,
              cursor: "pointer", transition: "color 150ms",
              textTransform: "capitalize",
            }}
          >
            {tab === "entrenamiento" ? "Entrenamiento" : "Integraciones"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "entrenamiento" ? (
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}
        >
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre del agente <span style={{ color: "#ef4444" }}>*</span></label>
            <input
              type="text" placeholder="Ej: Asistente Clínica Sonríe"
              value={form.name}
              onChange={(e) => upd({ name: e.target.value })}
              style={inputStyle} autoFocus required
            />
          </div>

          {/* Descripción */}
          <div>
            <label style={labelStyle}>Descripción</label>
            <input
              type="text" placeholder="Ej: Bot de atención al cliente para WhatsApp"
              value={form.description}
              onChange={(e) => upd({ description: e.target.value })}
              style={inputStyle}
            />
            <p style={hintStyle}>Breve descripción del propósito del agente (uso interno).</p>
          </div>

          {/* Instrucciones */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Instrucciones de entrenamiento</label>
            <textarea
              ref={textareaRef}
              placeholder={`Escribe aquí las instrucciones del agente. Ejemplo:\n\nEres el asistente virtual de Clínica Sonríe, una clínica dental en Santiago. Tu objetivo es ayudar a los pacientes a agendar citas, responder preguntas sobre precios y horarios, y derivar consultas complejas a un agente humano.\n\nResponde siempre en español, de forma amable y concisa.\nNo inventes precios ni disponibilidad.\nSi el usuario solicita hablar con una persona, activa el modo humano.`}
              value={form.instructions}
              onChange={(e) => upd({ instructions: e.target.value })}
              style={{ ...inputStyle, flex: 1, minHeight: 240, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
            <p style={hintStyle}>
              Define el rol, tono, limitaciones y reglas de escalada del agente.
            </p>
          </div>

          {/* LLM Provider */}
          <div>
            <label style={labelStyle}>Proveedor de IA</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["openai", "anthropic"] as const).map((p) => (
                <button
                  key={p} type="button"
                  onClick={() => upd({ llm_provider: p, llm_model: MODELS[p][0].id })}
                  style={{
                    flex: 1, padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                    border: `2px solid ${form.llm_provider === p ? "#2563eb" : "#e5e7eb"}`,
                    background: form.llm_provider === p ? "#eff6ff" : "white",
                    color: form.llm_provider === p ? "#1d4ed8" : "#374151",
                    fontWeight: form.llm_provider === p ? 700 : 400,
                    fontSize: 13, transition: "all 150ms",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {p === "openai" ? "🟢 OpenAI" : "🟣 Anthropic"}
                </button>
              ))}
            </div>
          </div>

          {/* LLM Model */}
          <div>
            <label style={labelStyle}>Modelo</label>
            <select
              value={form.llm_model}
              onChange={(e) => upd({ llm_model: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {MODELS[form.llm_provider].map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p style={hintStyle}>
              {form.llm_provider === "openai"
                ? "Requiere OPENAI_API_KEY en las variables de entorno."
                : "Requiere ANTHROPIC_API_KEY en las variables de entorno."}
            </p>
          </div>

          {/* Activo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button" role="switch" aria-checked={form.active}
              onClick={() => upd({ active: !form.active })}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: form.active ? "#22c55e" : "#d1d5db",
                position: "relative", transition: "background 200ms", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: form.active ? 23 : 3,
                width: 18, height: 18, borderRadius: "50%", background: "white",
                transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
            <span style={{ fontSize: 13, color: "#374151" }}>
              {form.active ? "Agente activo" : "Agente inactivo"}
            </span>
          </div>

          {/* Acciones */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Cancelar</button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Guardando…" : isNew ? "Crear agente" : "Guardar cambios"}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
          {!agent.id ? (
            <div style={{ textAlign: "center", padding: "48px 20px", color: "#9ca3af" }}>
              <p style={{ fontSize: 13 }}>Guarda el agente primero para configurar integraciones.</p>
            </div>
          ) : (
            <IntegrationsTab agentId={agent.id} />
          )}
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AgentesPage() {
  const [agents, setAgents]           = useState<Agent[]>([])
  const [loading, setLoading]         = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [saving, setSaving]           = useState(false)
  const [search, setSearch]           = useState("")

  async function loadAgents() {
    setLoading(true)
    const { data, error } = await supabase.from("agents").select("*").order("created_at", { ascending: false })
    if (error) console.error("[agentes]", error.message)
    else setAgents(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadAgents() }, [])

  async function handleSave(form: Agent) {
    setSaving(true)
    const payload = {
      name: form.name.trim(), description: form.description.trim(),
      instructions: form.instructions.trim(), active: form.active,
      llm_provider: form.llm_provider, llm_model: form.llm_model,
    }
    const { error } = form.id
      ? await supabase.from("agents").update(payload).eq("id", form.id)
      : await supabase.from("agents").insert(payload)
    setSaving(false)
    if (error) { alert("Error guardando agente: " + error.message); return }
    setSelectedAgent(null)
    loadAgents()
  }

  async function toggleActive(agent: Agent) {
    await supabase.from("agents").update({ active: !agent.active }).eq("id", agent.id!)
    setAgents((prev) => prev.map((a) => a.id === agent.id ? { ...a, active: !a.active } : a))
  }

  async function deleteAgent(agent: Agent) {
    if (!confirm(`¿Eliminar el agente "${agent.name}"? Esta acción no se puede deshacer.`)) return
    await supabase.from("agents").delete().eq("id", agent.id!)
    if (selectedAgent?.id === agent.id) setSelectedAgent(null)
    loadAgents()
  }

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase()
    return !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: "flex", height: "100%", background: "#f9fafb" }}>

      {/* ── Panel izquierdo: lista ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: selectedAgent ? "0 0 420px" : "1", minWidth: 0, transition: "flex 200ms" }}>

        {/* Top bar */}
        <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Agentes IA</h1>
              <span style={{ fontSize: 12, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 12, fontWeight: 500 }}>
                {agents.length} agente{agents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button type="button" onClick={() => setSelectedAgent({ ...EMPTY_AGENT })} style={primaryBtn}>
              + Nuevo agente
            </button>
          </div>

          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar agente…"
              style={{ ...filterInput, paddingLeft: 30, width: "100%" }}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
              Cargando agentes…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: "#9ca3af", gap: 12 }}>
              <span style={{ fontSize: 48 }}>🤖</span>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
                {search ? "No hay agentes que coincidan" : "Aún no tienes agentes"}
              </p>
              {!search && (
                <button type="button" onClick={() => setSelectedAgent({ ...EMPTY_AGENT })} style={primaryBtn}>
                  Crear primer agente
                </button>
              )}
            </div>
          ) : (
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              {filtered.map((agent) => {
                const isSelected = selectedAgent?.id === agent.id
                return (
                  <div
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    style={{
                      background: isSelected ? "#eff6ff" : "white",
                      border: `1px solid ${isSelected ? "#bfdbfe" : "#e5e7eb"}`,
                      borderRadius: 12, padding: "16px", cursor: "pointer",
                      transition: "box-shadow 150ms, border-color 150ms",
                      boxShadow: isSelected ? "0 0 0 2px #93c5fd44" : "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)" }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                        background: avatarColor(agent.id ?? agent.name),
                        color: "white", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 15, fontWeight: 700,
                      }}>
                        {initials(agent.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{agent.name}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                            background: agent.active ? "#d1fae5" : "#f3f4f6",
                            color: agent.active ? "#065f46" : "#9ca3af",
                          }}>
                            {agent.active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        {agent.description && (
                          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {agent.description}
                          </p>
                        )}
                        {agent.instructions && (
                          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {agent.instructions.slice(0, 120)}{agent.instructions.length > 120 ? "…" : ""}
                          </p>
                        )}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "#d1d5db" }}>
                            Creado {agent.created_at ? relativeDate(agent.created_at) : "—"}
                          </span>
                          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => toggleActive(agent)} title={agent.active ? "Desactivar" : "Activar"} style={{ ...iconBtn, color: agent.active ? "#059669" : "#9ca3af" }}>
                              {agent.active ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                              )}
                            </button>
                            <button type="button" onClick={() => setSelectedAgent(agent)} title="Editar" style={iconBtn}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button type="button" onClick={() => deleteAgent(agent)} title="Eliminar" style={{ ...iconBtn, color: "#ef4444" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel derecho: edición ── */}
      {selectedAgent && (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <AgentPanel
            agent={selectedAgent}
            onSave={handleSave}
            onClose={() => setSelectedAgent(null)}
            saving={saving}
          />
        </div>
      )}
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 14px", fontSize: 13, borderRadius: 8, border: "none",
  background: "#111827", color: "white", cursor: "pointer", fontWeight: 500,
}

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "white", color: "#374151", cursor: "pointer",
}

const iconBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid #e5e7eb", borderRadius: 7,
  padding: "5px 7px", cursor: "pointer", color: "#6b7280",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
}

const filterInput: React.CSSProperties = {
  padding: "7px 10px", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "white", outline: "none",
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: 13, boxSizing: "border-box", outline: "none",
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6,
}

const hintStyle: React.CSSProperties = {
  margin: "6px 0 0", fontSize: 12, color: "#9ca3af",
}

const closeBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: "1px solid #e5e7eb",
  background: "white", cursor: "pointer", fontSize: 20,
  display: "flex", alignItems: "center", justifyContent: "center",
}

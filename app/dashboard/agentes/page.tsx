"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

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

// ─── Panel de edición / creación ──────────────────────────────────────────────

function AgentPanel({
  agent,
  onSave,
  onClose,
  saving,
}: {
  agent: Agent
  onSave: (a: Agent) => Promise<void>
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<Agent>(agent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setForm(agent) }, [agent])

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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{isNew ? "Nuevo agente" : "Editar agente"}</h2>
        <button type="button" onClick={onClose} style={closeBtn} aria-label="Cerrar">×</button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ flex: 1, overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Nombre */}
        <div>
          <label style={labelStyle}>Nombre del agente <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            type="text"
            placeholder="Ej: Asistente Clínica Sonríe"
            value={form.name}
            onChange={(e) => upd({ name: e.target.value })}
            style={inputStyle}
            autoFocus
            required
          />
        </div>

        {/* Descripción */}
        <div>
          <label style={labelStyle}>Descripción</label>
          <input
            type="text"
            placeholder="Ej: Bot de atención al cliente para WhatsApp"
            value={form.description}
            onChange={(e) => upd({ description: e.target.value })}
            style={inputStyle}
          />
          <p style={hintStyle}>Breve descripción del propósito del agente (uso interno).</p>
        </div>

        {/* Instrucciones de entrenamiento */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <label style={labelStyle}>Instrucciones de entrenamiento</label>
          <textarea
            ref={textareaRef}
            placeholder={`Escribe aquí las instrucciones del agente. Ejemplo:\n\nEres el asistente virtual de Clínica Sonríe, una clínica dental en Santiago. Tu objetivo es ayudar a los pacientes a agendar citas, responder preguntas sobre precios y horarios, y derivar consultas complejas a un agente humano.\n\nResponde siempre en español, de forma amable y concisa.\nNo inventes precios ni disponibilidad.\nSi el usuario solicita hablar con una persona, activa el modo humano.`}
            value={form.instructions}
            onChange={(e) => upd({ instructions: e.target.value })}
            style={{
              ...inputStyle,
              flex: 1,
              minHeight: 280,
              resize: "vertical",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          />
          <p style={hintStyle}>
            Estas instrucciones definen el comportamiento del agente. Puedes indicar su rol, tono, limitaciones y reglas de escalada a humano.
          </p>
        </div>

        {/* LLM Provider */}
        <div>
          <label style={labelStyle}>Proveedor de IA</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["openai", "anthropic"] as const).map((p) => (
              <button
                key={p}
                type="button"
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
            type="button"
            role="switch"
            aria-checked={form.active}
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
          <button type="submit" disabled={saving || !form.name.trim()} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando…" : isNew ? "Crear agente" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AgentesPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")

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
    const payload = { name: form.name.trim(), description: form.description.trim(), instructions: form.instructions.trim(), active: form.active, llm_provider: form.llm_provider, llm_model: form.llm_model }

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
            <button
              type="button"
              onClick={() => setSelectedAgent({ ...EMPTY_AGENT })}
              style={primaryBtn}
            >
              + Nuevo agente
            </button>
          </div>

          {/* Búsqueda */}
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                      borderRadius: 12,
                      padding: "16px",
                      cursor: "pointer",
                      transition: "box-shadow 150ms, border-color 150ms",
                      boxShadow: isSelected ? "0 0 0 2px #93c5fd44" : "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)" }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Avatar */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                        background: avatarColor(agent.id ?? agent.name),
                        color: "white", display: "flex", alignItems: "center",
                        justifyContent: "center", fontSize: 15, fontWeight: 700,
                      }}>
                        {initials(agent.name)}
                      </div>

                      {/* Info */}
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
                          {/* Acciones rápidas */}
                          <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleActive(agent)}
                              title={agent.active ? "Desactivar" : "Activar"}
                              style={{ ...iconBtn, color: agent.active ? "#059669" : "#9ca3af" }}
                            >
                              {agent.active ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/></svg>
                              ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedAgent(agent)}
                              title="Editar"
                              style={iconBtn}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAgent(agent)}
                              title="Eliminar"
                              style={{ ...iconBtn, color: "#ef4444" }}
                            >
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

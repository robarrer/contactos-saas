"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"
import { INTEGRATIONS_CATALOG } from "@/app/lib/integrations/catalog"

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

type AgentIntegration = {
  id?: string
  agent_id: string
  platform: string
  config: Record<string, string>
  enabled: boolean
  enabled_functions: string[]
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

// ─── PlatformConfig: configurar una plataforma y sus funciones ───────────────

function PlatformConfig({
  platformId,
  agentId,
  existing,
  onBack,
  onSaved,
}: {
  platformId: string
  agentId: string
  existing: AgentIntegration | null
  onBack: () => void
  onSaved: () => void
}) {
  const platform = (INTEGRATIONS_CATALOG as Record<string, any>)[platformId]
  if (!platform) return null

  const defaultConfig: Record<string, string> = {}
  platform.configFields.forEach((f: any) => {
    defaultConfig[f.key] = f.default ?? ""
  })

  const [config, setConfig] = useState<Record<string, string>>(
    existing ? { ...defaultConfig, ...existing.config } : defaultConfig
  )
  const [enabledFns, setEnabledFns] = useState<string[]>(existing?.enabled_functions ?? [])
  const [enabled, setEnabled]       = useState(existing?.enabled ?? true)
  const [saving, setSaving]         = useState(false)
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting]       = useState(false)

  async function handleTest() {
    setTesting(true)
    setTestStatus(null)
    try {
      const res = await fetch("/API/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_token: config.api_token, api_url: config.api_url }),
      })
      const data = await res.json()
      setTestStatus({ ok: data.ok, message: data.message })
    } catch {
      setTestStatus({ ok: false, message: "Error al conectar con el servidor." })
    }
    setTesting(false)
  }

  const isNew = !existing?.id

  function toggleFn(fnId: string) {
    setEnabledFns((prev) =>
      prev.includes(fnId) ? prev.filter((id) => id !== fnId) : [...prev, fnId]
    )
  }

  function toggleAllFns() {
    const allIds = platform.functions.map((f: any) => f.id)
    setEnabledFns((prev) => prev.length === allIds.length ? [] : allIds)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const requiredFields = platform.configFields.filter((f: any) => f.required)
    for (const f of requiredFields) {
      if (!config[f.key]?.trim()) {
        alert(`El campo "${f.label}" es requerido.`)
        return
      }
    }
    setSaving(true)
    if (isNew) {
      await supabase.from("agent_integrations").insert({
        agent_id: agentId,
        platform: platformId,
        config,
        enabled,
        enabled_functions: enabledFns,
      })
    } else {
      await supabase
        .from("agent_integrations")
        .update({ config, enabled, enabled_functions: enabledFns })
        .eq("id", existing!.id)
    }
    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!existing?.id) return
    if (!confirm(`¿Desconectar la integración con ${platform.name}?`)) return
    await supabase.from("agent_integrations").delete().eq("id", existing.id)
    onSaved()
  }

  // Group functions by category
  const byCategory: Record<string, any[]> = {}
  for (const fn of platform.functions) {
    if (!byCategory[fn.category]) byCategory[fn.category] = []
    byCategory[fn.category].push(fn)
  }
  const allFnIds = platform.functions.map((f: any) => f.id)
  const allEnabled = enabledFns.length === allFnIds.length

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" onClick={onBack}
          style={{ ...secondaryBtn, display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
          ← Volver
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: `${platform.color}18`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>
          {platform.icon}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{platform.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{platform.description}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Toggle value={enabled} onChange={setEnabled} />
          <span style={{ fontSize: 12, color: enabled ? "#059669" : "#9ca3af" }}>
            {enabled ? "Activa" : "Inactiva"}
          </span>
        </div>
      </div>

      {/* Config fields */}
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 4 }}>Credenciales de conexión</div>
        {platform.configFields.map((field: any) => (
          <div key={field.key}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: "#ef4444" }}>*</span>}
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={field.type === "password" && !showValues[field.key] ? "password" : "text"}
                placeholder={field.placeholder}
                value={config[field.key] ?? ""}
                onChange={(e) => setConfig((p) => ({ ...p, [field.key]: e.target.value }))}
                style={{ ...inputStyle, paddingRight: field.type === "password" ? 40 : undefined }}
                required={field.required}
              />
              {field.type === "password" && (
                <button type="button"
                  onClick={() => setShowValues((p) => ({ ...p, [field.key]: !p[field.key] }))}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2,
                  }}>
                  {showValues[field.key] ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/></svg>
                  )}
                </button>
              )}
            </div>
            {field.hint && <p style={hintStyle}>{field.hint}</p>}
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <button type="button" onClick={handleTest} disabled={testing || !config.api_token?.trim()}
            style={{ ...secondaryBtn, fontSize: 12, opacity: testing ? 0.7 : 1 }}>
            {testing ? "Probando…" : "Probar conexión"}
          </button>
          {testStatus && (
            <span style={{ fontSize: 12, color: testStatus.ok ? "#059669" : "#dc2626", fontWeight: 500 }}>
              {testStatus.ok ? "✓" : "✗"} {testStatus.message}
            </span>
          )}
        </div>
      </div>

      {/* Functions */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>Funciones disponibles</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {enabledFns.length} de {allFnIds.length} funciones habilitadas
            </div>
          </div>
          <button type="button" onClick={toggleAllFns}
            style={{ ...secondaryBtn, fontSize: 12, padding: "5px 12px" }}>
            {allEnabled ? "Deshabilitar todas" : "Habilitar todas"}
          </button>
        </div>

        {Object.entries(byCategory).map(([category, fns]) => (
          <div key={category}>
            <div style={{
              padding: "8px 16px 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af",
              textTransform: "uppercase", letterSpacing: "0.05em", background: "#fafafa",
            }}>
              {category}
            </div>
            {fns.map((fn: any, i: number) => {
              const isEnabled = enabledFns.includes(fn.id)
              const isLast = i === fns.length - 1
              return (
                <div key={fn.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 16px",
                  borderBottom: isLast ? "none" : "1px solid #f3f4f6",
                  background: isEnabled ? "white" : "#fafafa",
                  opacity: isEnabled ? 1 : 0.6,
                  transition: "all 150ms",
                }}>
                  <Toggle small value={isEnabled} onChange={() => toggleFn(fn.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827", fontFamily: "monospace" }}>
                      {fn.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.4 }}>
                      {fn.description}
                    </div>
                    {fn.parameters?.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {fn.parameters.map((p: any) => (
                          <span key={p.name} style={{
                            fontSize: 10, padding: "2px 7px", borderRadius: 4,
                            background: p.required ? "#dbeafe" : "#f3f4f6",
                            color: p.required ? "#1d4ed8" : "#6b7280",
                          }}>
                            {p.name}{p.required ? " *" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4, flexShrink: 0, marginTop: 2,
                    background: fn.http_method === "GET" ? "#dbeafe" : fn.http_method === "POST" ? "#d1fae5" : "#fef3c7",
                    color: fn.http_method === "GET" ? "#1d4ed8" : fn.http_method === "POST" ? "#065f46" : "#92400e",
                    fontWeight: 600, fontFamily: "monospace",
                  }}>
                    {fn.http_method}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 4 }}>
        <div>
          {!isNew && (
            <button type="button" onClick={handleDelete}
              style={{ ...secondaryBtn, color: "#ef4444", borderColor: "#fca5a5" }}>
              Desconectar
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onBack} style={secondaryBtn}>Cancelar</button>
          <button type="submit" disabled={saving}
            style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Guardando…" : isNew ? "Conectar integración" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </form>
  )
}

// ─── IntegrationsTab: catálogo de plataformas ─────────────────────────────────

function IntegrationsTab({ agentId }: { agentId: string }) {
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([])
  const [loading, setLoading]           = useState(true)
  const [configuring, setConfiguring]   = useState<string | null>(null)

  async function loadIntegrations() {
    setLoading(true)
    const { data } = await supabase
      .from("agent_integrations")
      .select("*")
      .eq("agent_id", agentId)
    setIntegrations(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadIntegrations() }, [agentId])

  if (configuring) {
    const existing = integrations.find((i) => i.platform === configuring) ?? null
    return (
      <PlatformConfig
        platformId={configuring}
        agentId={agentId}
        existing={existing}
        onBack={() => setConfiguring(null)}
        onSaved={() => { setConfiguring(null); loadIntegrations() }}
      />
    )
  }

  const platforms = Object.values(INTEGRATIONS_CATALOG) as any[]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Conecta este agente a plataformas externas. Una vez configurada, el agente podrá
        usar las funciones habilitadas durante las conversaciones.
      </p>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>Cargando…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {platforms.map((platform: any) => {
            const existing = integrations.find((i) => i.platform === platform.id)
            const isConnected = !!existing
            const activeFns   = existing?.enabled_functions?.length ?? 0

            return (
              <div key={platform.id} style={{
                background: "white", border: `1px solid ${isConnected ? platform.color + "44" : "#e5e7eb"}`,
                borderRadius: 12, padding: "16px",
                opacity: isConnected && !existing.enabled ? 0.65 : 1,
                transition: "box-shadow 150ms",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)" }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none" }}>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* Logo */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: isConnected ? `${platform.color}18` : "#f3f4f6",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24,
                  }}>
                    {platform.icon}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{platform.name}</span>
                      {isConnected ? (
                        <span style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                          background: existing.enabled ? "#d1fae5" : "#f3f4f6",
                          color: existing.enabled ? "#065f46" : "#9ca3af",
                        }}>
                          {existing.enabled ? "Conectada" : "Desactivada"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#f3f4f6", color: "#9ca3af" }}>
                          No configurada
                        </span>
                      )}
                      {isConnected && (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#2563eb" }}>
                          {activeFns} función{activeFns !== 1 ? "es" : ""} activa{activeFns !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
                      {platform.description}
                    </div>
                  </div>

                  {/* Action */}
                  <button type="button" onClick={() => setConfiguring(platform.id)}
                    style={isConnected ? secondaryBtn : primaryBtn}>
                    {isConnected ? "Configurar" : "Conectar"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Toggle reutilizable ──────────────────────────────────────────────────────

function Toggle({ value, onChange, small = false }: { value: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  const w = small ? 34 : 44
  const h = small ? 18 : 24
  const r = small ? 9 : 12
  const dot = small ? 14 : 18
  const on = small ? 17 : 23
  const off = small ? 2 : 3
  const top = small ? 2 : 3

  return (
    <button
      type="button" role="switch" aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: w, height: h, borderRadius: r, border: "none", cursor: "pointer",
        background: value ? "#22c55e" : "#d1d5db",
        position: "relative", transition: "background 200ms", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top, left: value ? on : off,
        width: dot, height: dot, borderRadius: "50%", background: "white",
        transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
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
  const [form, setForm]           = useState<Agent>(agent)
  const [activeTab, setActiveTab] = useState<"entrenamiento" | "integraciones">("entrenamiento")
  const textareaRef               = useRef<HTMLTextAreaElement>(null)

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
              background: avatarColor(agent.id), color: "white",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
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
          <button key={tab} type="button" onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 16px", fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "#2563eb" : "#6b7280",
              borderBottom: `2px solid ${activeTab === tab ? "#2563eb" : "transparent"}`,
              background: "transparent", border: "none",
              cursor: "pointer", transition: "color 150ms",
            }}
          >
            {tab === "entrenamiento" ? "Entrenamiento" : "Integraciones"}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "entrenamiento" ? (
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>

          <div>
            <label style={labelStyle}>Nombre del agente <span style={{ color: "#ef4444" }}>*</span></label>
            <input type="text" placeholder="Ej: Asistente Clínica Sonríe" value={form.name}
              onChange={(e) => upd({ name: e.target.value })} style={inputStyle} autoFocus required />
          </div>

          <div>
            <label style={labelStyle}>Descripción</label>
            <input type="text" placeholder="Ej: Bot de atención al cliente para WhatsApp" value={form.description}
              onChange={(e) => upd({ description: e.target.value })} style={inputStyle} />
            <p style={hintStyle}>Breve descripción del propósito del agente (uso interno).</p>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Instrucciones de entrenamiento</label>
            <textarea
              ref={textareaRef}
              placeholder={`Escribe aquí las instrucciones del agente. Ejemplo:\n\nEres el asistente virtual de Clínica Sonríe, una clínica dental en Santiago. Tu objetivo es ayudar a los pacientes a agendar citas, responder preguntas sobre precios y horarios, y derivar consultas complejas a un agente humano.\n\nResponde siempre en español, de forma amable y concisa.\nNo inventes precios ni disponibilidad.\nSi el usuario solicita hablar con una persona, activa el modo humano.`}
              value={form.instructions}
              onChange={(e) => upd({ instructions: e.target.value })}
              style={{ ...inputStyle, flex: 1, minHeight: 240, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
            />
            <p style={hintStyle}>Define el rol, tono, limitaciones y reglas de escalada del agente.</p>
          </div>

          <div>
            <label style={labelStyle}>Proveedor de IA</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["openai", "anthropic"] as const).map((p) => (
                <button key={p} type="button"
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

          <div>
            <label style={labelStyle}>Modelo</label>
            <select value={form.llm_model} onChange={(e) => upd({ llm_model: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}>
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

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Toggle value={form.active} onChange={(v) => upd({ active: v })} />
            <span style={{ fontSize: 13, color: "#374151" }}>{form.active ? "Agente activo" : "Agente inactivo"}</span>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Cancelar</button>
            <button type="submit" disabled={saving || !form.name.trim()}
              style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
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
  const [agents, setAgents]               = useState<Agent[]>([])
  const [loading, setLoading]             = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [saving, setSaving]               = useState(false)
  const [search, setSearch]               = useState("")

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

      {/* ── Lista ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: selectedAgent ? "0 0 420px" : "1", minWidth: 0, transition: "flex 200ms" }}>

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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agente…"
              style={{ ...filterInput, paddingLeft: 30, width: "100%" }} />
          </div>
        </div>

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
                  <div key={agent.id} onClick={() => setSelectedAgent(agent)}
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
                            <button type="button" onClick={() => toggleActive(agent)} title={agent.active ? "Desactivar" : "Activar"}
                              style={{ ...iconBtn, color: agent.active ? "#059669" : "#9ca3af" }}>
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

      {/* ── Panel edición ── */}
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

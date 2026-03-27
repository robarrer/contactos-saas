"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "respuestas" | "bot" | "usuarios" | "organizacion"

type SettingKey = "message_debounce_seconds"
type Settings = { message_debounce_seconds: number }
const DEFAULTS: Settings = { message_debounce_seconds: 5 }

type CannedResponse = {
  id: string
  category: string
  title: string
  content: string
  created_at: string
}

const EMPTY_CR: Omit<CannedResponse, "id" | "created_at"> = { category: "", title: "", content: "" }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function debounceLabel(s: number) {
  if (s === 0) return "Sin pausa (respuesta inmediata)"
  if (s === 1) return "1 segundo"
  if (s <= 8) return `${s} segundos`
  return "8 segundos (máximo)"
}

function debounceColor(s: number) {
  if (s === 0) return "#2563eb"
  if (s <= 5) return "#16a34a"
  if (s <= 15) return "#ca8a04"
  return "#dc2626"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AjustesPage() {
  const [tab, setTab] = useState<Tab>("respuestas")

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>

      {/* Top bar */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", gap: 24 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Ajustes</h1>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, background: "#f3f4f6", borderRadius: 9, padding: 3 }}>
          {([
            { id: "respuestas",    label: "Respuestas predefinidas" },
            { id: "bot",          label: "Comportamiento del bot"  },
            { id: "usuarios",     label: "Usuarios"                },
            { id: "organizacion", label: "Organización"            },
          ] as { id: Tab; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "6px 16px",
                borderRadius: 7,
                border: "none",
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                background: tab === t.id ? "white" : "transparent",
                color: tab === t.id ? "#111827" : "#6b7280",
                cursor: "pointer",
                boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 120ms",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "respuestas"    && <RespuestasTab />}
        {tab === "bot"           && <BotTab />}
        {tab === "usuarios"      && <UsuariosTab />}
        {tab === "organizacion"  && <OrganizacionTab />}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Respuestas predefinidas
// ══════════════════════════════════════════════════════════════════════════════

function RespuestasTab() {
  const [items, setItems]         = useState<CannedResponse[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState(EMPTY_CR)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const [orgId, setOrgId]         = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.organization_id) setOrgId(data.organization_id) })
    })
  }, [])

  async function load() {
    if (!orgId) return
    setLoading(true)
    const { data } = await supabase.from("canned_responses").select("*").eq("organization_id", orgId).order("category").order("title")
    setItems(data ?? [])
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [orgId])
  useEffect(() => { if (showForm) setTimeout(() => titleRef.current?.focus(), 50) }, [showForm])
  useEffect(() => {
    if (!showForm && !deleteId) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowForm(false); setDeleteId(null) } }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showForm, deleteId])

  function openNew()  { setEditingId(null); setForm(EMPTY_CR); setShowForm(true) }
  function openEdit(item: CannedResponse) { setEditingId(item.id); setForm({ category: item.category, title: item.title, content: item.content }); setShowForm(true) }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    const data = { category: form.category.trim() || "General", title: form.title.trim(), content: form.content.trim() }
    if (editingId) await supabase.from("canned_responses").update(data).eq("id", editingId)
    else           await supabase.from("canned_responses").insert({ ...data, organization_id: orgId })
    setSaving(false); setShowForm(false); load()
  }

  async function handleDelete(id: string) {
    await supabase.from("canned_responses").delete().eq("id", id)
    setDeleteId(null); load()
  }

  const categories = Array.from(new Set(items.map((i) => i.category))).sort()
  const filtered   = items.filter((item) => {
    if (catFilter !== "all" && item.category !== catFilter) return false
    if (search) { const q = search.toLowerCase(); return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) }
    return true
  })
  const grouped = filtered.reduce<Record<string, CannedResponse[]>>((acc, item) => {
    ;(acc[item.category] = acc[item.category] || []).push(item)
    return acc
  }, {})

  return (
    <>
      {/* Sub-toolbar */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderBottom: "1px solid #f3f4f6", background: "white" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar respuesta…"
            style={{ width: "100%", paddingLeft: 29, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", boxSizing: "border-box" }} />
        </div>
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", outline: "none", cursor: "pointer" }}>
          <option value="all">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {!loading && <span style={{ fontSize: 13, color: "#9ca3af" }}>{filtered.length} {filtered.length === 1 ? "respuesta" : "respuestas"}</span>}
        <button onClick={openNew}
          style={{ marginLeft: "auto", padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#111827", color: "white", cursor: "pointer" }}>
          + Nueva respuesta
        </button>
      </div>

      {/* Cards */}
      <div style={{ padding: "20px 24px" }}>
        {loading && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, color: "#9ca3af", fontSize: 14 }}>Cargando…</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, color: "#9ca3af", gap: 8 }}>
            <span style={{ fontSize: 36 }}>⚡</span>
            <p style={{ margin: 0, fontSize: 14 }}>{search || catFilter !== "all" ? "Sin coincidencias" : "Aún no hay respuestas prediseñadas"}</p>
            {!search && catFilter === "all" && (
              <button onClick={openNew} style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Crear la primera</button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>{catItems.length}</span>
                  <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {catItems.map((item) => (
                    <div key={item.id} style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#111827", lineHeight: 1.4 }}>{item.title}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.content}</p>
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <button onClick={() => openEdit(item)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, color: "#374151", fontWeight: 500 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Editar
                        </button>
                        <button onClick={() => setDeleteId(item.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", fontSize: 12, color: "#ef4444", fontWeight: 500 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editingId ? "Editar respuesta" : "Nueva respuesta"}</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Categoría</span>
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej: Saludos, Citas, Pagos…" list="cats-list" style={inputStyle} />
                <datalist id="cats-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Título <span style={{ color: "#ef4444" }}>*</span></span>
                <input ref={titleRef} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nombre corto descriptivo" style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Contenido <span style={{ color: "#ef4444" }}>*</span></span>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Texto del mensaje…" rows={5} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim() || !form.content.trim()}
                style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: saving || !form.title.trim() || !form.content.trim() ? "#9ca3af" : "#111827", color: "white", cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear respuesta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteId(null) }}>
          <div style={{ width: "min(400px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>¿Eliminar respuesta?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => handleDelete(deleteId)} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#ef4444", color: "white", cursor: "pointer" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Comportamiento del bot
// ══════════════════════════════════════════════════════════════════════════════

function BotTab() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState<SettingKey | null>(null)
  const [saved, setSaved]       = useState<SettingKey | null>(null)
  const [orgId, setOrgId]       = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.organization_id) setOrgId(data.organization_id) })
    })
  }, [])

  useEffect(() => {
    if (!orgId) return
    supabase.from("settings").select("key, value").eq("organization_id", orgId).then(({ data }) => {
      if (data) {
        const map: Partial<Settings> = {}
        for (const row of data) {
          if (row.key === "message_debounce_seconds") map.message_debounce_seconds = parseInt(row.value, 10)
        }
        setSettings({ ...DEFAULTS, ...map })
      }
      setLoading(false)
    })
  }, [orgId])

  async function saveSetting(key: SettingKey, value: number) {
    if (!orgId) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaving(key)
    await supabase.from("settings").upsert({ key, value: String(value), organization_id: orgId }, { onConflict: "key,organization_id" })
    setSaving(null); setSaved(key)
    timerRef.current = setTimeout(() => setSaved(null), 2000)
  }

  const dv = settings.message_debounce_seconds
  const dc = debounceColor(dv)

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>Cargando ajustes…</div>

  return (
    <div style={{ maxWidth: 680, padding: "28px 24px" }}>
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/>
            <circle cx="9" cy="16" r="1" fill="#6366f1"/><circle cx="15" cy="16" r="1" fill="#6366f1"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Comportamiento del bot</h2>
        </div>

        <div style={{ padding: "20px 20px" }}>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 3 }}>Tiempo de pausa para agrupar mensajes</div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              Cuando un usuario envía varios mensajes seguidos, el bot espera este tiempo antes de responder. Agrupa los mensajes y evita respuestas redundantes.
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Actualmente:{" "}
              <strong style={{ color: dc }}>{debounceLabel(dv)}</strong>
              {saving === "message_debounce_seconds" && <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>Guardando…</span>}
              {saved   === "message_debounce_seconds" && <span style={{ marginLeft: 8, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <input
                type="range" min={0} max={8} step={1} value={Math.min(dv, 8)}
                onChange={(e) => setSettings((p) => ({ ...p, message_debounce_seconds: parseInt(e.target.value) }))}
                onMouseUp={(e)  => saveSetting("message_debounce_seconds", parseInt((e.target as HTMLInputElement).value))}
                onTouchEnd={(e) => saveSetting("message_debounce_seconds", parseInt((e.target as HTMLInputElement).value))}
                style={{ flex: 1, accentColor: dc, cursor: "pointer", height: 4 }}
              />
              <div style={{ minWidth: 52, height: 36, borderRadius: 8, background: dc + "15", border: `1.5px solid ${dc}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: dc }}>
                {dv}s
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", paddingRight: 66 }}>
              <span>0s</span><span>2s</span><span>4s</span><span>6s</span><span>8s</span>
            </div>

            {dv > 5 && (
              <div style={{ display: "flex", gap: 8, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e" }}>
                <span>⚠️</span>
                <span>Valores altos hacen que el bot parezca lento. El máximo técnico es 8s para no exceder el tiempo límite de procesamiento.</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
              {[
                { label: "Inmediato",    value: 0, desc: "Responde cada mensaje por separado" },
                { label: "Recomendado",  value: 5, desc: "Agrupa mensajes enviados en 5s"      },
                { label: "Conservador",  value: 8, desc: "Máximo — espera que el usuario termine" },
              ].map((p) => (
                <button key={p.value}
                  onClick={() => { setSettings((prev) => ({ ...prev, message_debounce_seconds: p.value })); saveSetting("message_debounce_seconds", p.value) }}
                  style={{ padding: "8px 10px", borderRadius: 8, border: dv === p.value ? `2px solid ${debounceColor(p.value)}` : "1px solid #e5e7eb", background: dv === p.value ? debounceColor(p.value) + "10" : "white", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 2 }}>{p.label} · {p.value}s</div>
                  <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.3 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Usuarios
// ══════════════════════════════════════════════════════════════════════════════

type User = { id: string; email: string; full_name: string; role: string }

const EMPTY_USER = { email: "", password: "", full_name: "", role: "admin" }

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "agent", label: "Agente"        },
]

function UsuariosTab() {
  const [users, setUsers]       = useState<User[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]         = useState(EMPTY_USER)
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const res = await fetch("/API/admin/users")
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (showForm) setTimeout(() => emailRef.current?.focus(), 50) }, [showForm])
  useEffect(() => {
    if (!showForm && !deleteId) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowForm(false); setDeleteId(null) } }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showForm, deleteId])

  function openNew() {
    setEditingId(null); setForm(EMPTY_USER); setError(null); setShowForm(true)
  }
  function openEdit(u: User) {
    setEditingId(u.id); setForm({ email: u.email, password: "", full_name: u.full_name, role: u.role }); setError(null); setShowForm(true)
  }

  async function handleSave() {
    setError(null)
    if (!editingId && !form.email.trim()) { setError("El email es obligatorio"); return }
    if (!editingId && !form.password.trim()) { setError("La contraseña es obligatoria"); return }
    setSaving(true)

    const res = await fetch("/API/admin/users", {
      method:  editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(editingId ? { id: editingId, full_name: form.full_name, role: form.role, password: form.password || undefined } : form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? "Error desconocido"); return }
    setShowForm(false); load()
  }

  async function handleDelete(id: string) {
    await fetch("/API/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    setDeleteId(null); load()
  }

  const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r

  return (
    <>
      {/* Sub-toolbar */}
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #f3f4f6", background: "white" }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {loading ? "Cargando…" : `${users.length} ${users.length === 1 ? "usuario" : "usuarios"}`}
        </span>
        <button onClick={openNew}
          style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#111827", color: "white", cursor: "pointer" }}>
          + Nuevo usuario
        </button>
      </div>

      {/* Table */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
            Cargando usuarios…
          </div>
        ) : users.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 10 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4"/><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7"/>
              <circle cx="19" cy="9" r="2.5"/><path d="M22 21c0-2.5-1.5-4.5-3-5"/>
            </svg>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No hay usuarios todavía</p>
            <button onClick={openNew} style={{ fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Crear el primero</button>
          </div>
        ) : (
          <div style={{ background: "white", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={utTh}>Usuario</th>
                  <th style={utTh}>Email</th>
                  <th style={utTh}>Rol</th>
                  <th style={utTh}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid #f3f4f6", background: "white" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#f9fafb" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "white" }}
                  >
                    {/* Avatar + nombre */}
                    <td style={utTd}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: userAvatarColor(u.id),
                          color: "white", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(u.full_name || u.email).slice(0, 1).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500, fontSize: 13, color: "#111827" }}>
                          {u.full_name || <span style={{ color: "#9ca3af" }}>Sin nombre</span>}
                        </span>
                      </div>
                    </td>

                    <td style={{ ...utTd, color: "#6b7280", fontSize: 13 }}>{u.email}</td>

                    {/* Badge rol */}
                    <td style={utTd}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20,
                        background: u.role === "admin" ? "#eff6ff" : "#f0fdf4",
                        color: u.role === "admin" ? "#2563eb" : "#16a34a",
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {roleLabel(u.role)}
                      </span>
                    </td>

                    {/* Acciones */}
                    <td style={utTd}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => openEdit(u)}
                          title="Editar"
                          style={{ background: "transparent", border: "1px solid #e5e7eb", padding: "5px 9px", borderRadius: 7, cursor: "pointer", color: "#6b7280", display: "inline-flex", alignItems: "center" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20H21"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteId(u.id)}
                          title="Eliminar"
                          style={{ background: "transparent", border: "1px solid #e5e7eb", padding: "5px 9px", borderRadius: 7, cursor: "pointer", color: "#6b7280", display: "inline-flex", alignItems: "center" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#fecaca"; e.currentTarget.style.color = "#ef4444" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#6b7280" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {/* Modal crear / editar */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <div style={{ width: "min(480px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editingId ? "Editar usuario" : "Nuevo usuario"}</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

              {!editingId && (
                <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={labelStyle}>Email <span style={{ color: "#ef4444" }}>*</span></span>
                  <input ref={emailRef} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="usuario@email.com" style={inputStyle} />
                </label>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>{editingId ? "Nueva contraseña" : "Contraseña"} {!editingId && <span style={{ color: "#ef4444" }}>*</span>}</span>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editingId ? "Dejar vacío para no cambiar" : "Mínimo 6 caracteres"} style={inputStyle} />
                {editingId && <span style={{ fontSize: 11, color: "#9ca3af" }}>Dejar vacío para mantener la contraseña actual</span>}
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Nombre completo</span>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nombre del usuario" style={inputStyle} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Rol</span>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={{ ...inputStyle, cursor: "pointer", background: "white" }}>
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Por ahora todos los roles tienen acceso completo</span>
              </label>

              {error && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#dc2626" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "white", cursor: saving ? "wait" : "pointer" }}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear usuario"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {deleteId && (() => {
        const u = users.find((x) => x.id === deleteId)
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteId(null) }}>
            <div style={{ width: "min(400px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: 24 }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>¿Eliminar usuario?</h2>
              <p style={{ margin: "0 0 4px", fontSize: 14, color: "#6b7280" }}>Se eliminará permanentemente:</p>
              <p style={{ margin: "0 0 20px", fontSize: 14, fontWeight: 600, color: "#111827" }}>{u?.full_name || u?.email}</p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setDeleteId(null)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}>Cancelar</button>
                <button onClick={() => handleDelete(deleteId)} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#ef4444", color: "white", cursor: "pointer" }}>Eliminar</button>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Organización
// ══════════════════════════════════════════════════════════════════════════════

type OrgData = {
  whatsapp_token:               string
  whatsapp_phone_number_id:     string
  whatsapp_business_account_id: string
  whatsapp_verify_token:        string
  whatsapp_app_secret:          string
  has_token:        boolean
  has_verify_token: boolean
  has_app_secret:   boolean
}

const EMPTY_ORG_FORM = {
  whatsapp_token:               "",
  whatsapp_phone_number_id:     "",
  whatsapp_business_account_id: "",
  whatsapp_verify_token:        "",
  whatsapp_app_secret:          "",
}

function OrganizacionTab() {
  const [current, setCurrent]     = useState<OrgData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY_ORG_FORM)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showFields, setShowFields] = useState<Record<string, boolean>>({})
  const [copied, setCopied]       = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/API/webhook/whatsapp`
    : "/API/webhook/whatsapp"

  useEffect(() => {
    fetch("/API/admin/organization")
      .then((r) => r.json())
      .then((d) => { if (d.org) setCurrent(d.org) })
      .finally(() => setLoading(false))
  }, [])

  function toggleShow(field: string) {
    setShowFields((p) => ({ ...p, [field]: !p[field] }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const hasAny = Object.values(form).some((v) => v.trim() !== "")
    if (!hasAny) { setError("Completa al menos un campo para actualizar."); return }
    setSaving(true)
    const res  = await fetch("/API/admin/organization", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? "Error desconocido"); return }
    setForm(EMPTY_ORG_FORM)
    setSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaved(false), 3000)
    // Refrescar valores enmascarados
    fetch("/API/admin/organization").then((r) => r.json()).then((d) => { if (d.org) setCurrent(d.org) })
  }

  async function copyWebhook() {
    try { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* noop */ }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
      Cargando configuración…
    </div>
  )

  const fields: { key: keyof typeof EMPTY_ORG_FORM; label: string; placeholder: string; secret: boolean; help: string }[] = [
    {
      key:    "whatsapp_token",
      label:  "Token de acceso (WhatsApp)",
      placeholder: current?.has_token ? "Dejar vacío para no cambiar" : "EAAxxxxx…",
      secret: true,
      help:   "Meta Business Suite → Usuarios del sistema → Generar token (permisos whatsapp_business_messaging)",
    },
    {
      key:    "whatsapp_phone_number_id",
      label:  "Phone Number ID",
      placeholder: current?.whatsapp_phone_number_id || "1234567890",
      secret: false,
      help:   "Meta for Developers → tu App → WhatsApp → Getting Started → Phone Number ID",
    },
    {
      key:    "whatsapp_business_account_id",
      label:  "WABA ID (Business Account ID)",
      placeholder: current?.whatsapp_business_account_id || "1234567890",
      secret: false,
      help:   "Meta for Developers → tu App → WhatsApp → Getting Started → WhatsApp Business Account ID",
    },
    {
      key:    "whatsapp_verify_token",
      label:  "Verify Token (webhook)",
      placeholder: current?.has_verify_token ? "Dejar vacío para no cambiar" : "mi_token_secreto",
      secret: true,
      help:   "String aleatorio que tú defines; se usa para verificar el webhook en Meta",
    },
    {
      key:    "whatsapp_app_secret",
      label:  "App Secret",
      placeholder: current?.has_app_secret ? "Dejar vacío para no cambiar" : "abc123…",
      secret: true,
      help:   "Meta for Developers → tu App → Configuración → Básica → Secreto de la app",
    },
  ]

  return (
    <div style={{ maxWidth: 680, padding: "28px 24px" }}>

      {/* URL del Webhook */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>URL del Webhook</h2>
          <span style={{ fontSize: 12, color: "#6b7280", background: "#f3f4f6", padding: "2px 8px", borderRadius: 10 }}>Solo lectura</span>
        </div>
        <div style={{ padding: "16px 20px" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
            Configura esta URL en <strong>Meta for Developers → tu App → WhatsApp → Configuración → Webhook</strong>.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#374151", wordBreak: "break-all" }}>
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={copyWebhook}
              style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: copied ? "#f0fdf4" : "white", cursor: "pointer", fontSize: 12, fontWeight: 600, color: copied ? "#16a34a" : "#374151", display: "flex", alignItems: "center", gap: 5, transition: "all 150ms" }}
            >
              {copied ? (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado</>
              ) : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Formulario credenciales */}
      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>Credenciales de WhatsApp</h2>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ padding: "20px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
            {fields.map((f) => (
              <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{f.label}</span>
                <div style={{ position: "relative" }}>
                  <input
                    type={f.secret && !showFields[f.key] ? "password" : "text"}
                    value={form[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    autoComplete="off"
                    style={{ ...inputStyle, paddingRight: f.secret ? 40 : 10 }}
                  />
                  {f.secret && (
                    <button
                      type="button"
                      onClick={() => toggleShow(f.key)}
                      title={showFields[f.key] ? "Ocultar" : "Mostrar"}
                      style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2, display: "flex", alignItems: "center" }}
                    >
                      {showFields[f.key] ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{f.help}</span>
              </label>
            ))}

            {error && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#dc2626" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4, borderTop: "1px solid #f3f4f6" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", flex: 1 }}>
                Solo se actualizan los campos que completes. Los campos vacíos mantienen su valor actual.
              </p>
              <button
                type="submit"
                disabled={saving}
                style={{ flexShrink: 0, padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "white", cursor: saving ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                {saving ? (
                  "Guardando…"
                ) : saved ? (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Guardado</>
                ) : (
                  "Guardar cambios"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151" }
const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" }

// Estilos tabla usuarios — mismo patrón que Contactos
const utTh: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
}
const utTd: React.CSSProperties = { padding: "10px 14px", verticalAlign: "middle" }

const AVATAR_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6"]
function userAvatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "respuestas" | "bot" | "usuarios"

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
  if (s < 60) return `${s} segundos`
  return "60 segundos"
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
            { id: "respuestas", label: "Respuestas predefinidas" },
            { id: "bot",        label: "Comportamiento del bot"  },
            { id: "usuarios",   label: "Usuarios"                },
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
        {tab === "respuestas" && <RespuestasTab />}
        {tab === "bot"        && <BotTab />}
        {tab === "usuarios"   && <UsuariosTab />}
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
  const titleRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("canned_responses").select("*").order("category").order("title")
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
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
    else           await supabase.from("canned_responses").insert(data)
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.from("settings").select("key, value").then(({ data }) => {
      if (data) {
        const map: Partial<Settings> = {}
        for (const row of data) {
          if (row.key === "message_debounce_seconds") map.message_debounce_seconds = parseInt(row.value, 10)
        }
        setSettings({ ...DEFAULTS, ...map })
      }
      setLoading(false)
    })
  }, [])

  async function saveSetting(key: SettingKey, value: number) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaving(key)
    await supabase.from("settings").upsert({ key, value: String(value) }, { onConflict: "key" })
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
                type="range" min={0} max={60} step={1} value={dv}
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
              <span>0s</span><span>15s</span><span>30s</span><span>45s</span><span>60s</span>
            </div>

            {dv > 20 && (
              <div style={{ display: "flex", gap: 8, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e" }}>
                <span>⚠️</span>
                <span>Un tiempo alto puede hacer que el bot parezca lento. Se recomienda entre 3 y 10 segundos.</span>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
              {[
                { label: "Inmediato", value: 0,  desc: "Responde cada mensaje por separado" },
                { label: "Recomendado", value: 5, desc: "Agrupa mensajes enviados en 5s" },
                { label: "Conservador", value: 15, desc: "Espera que el usuario termine" },
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
      <div style={{ padding: "20px 24px" }}>
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
      </div>

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

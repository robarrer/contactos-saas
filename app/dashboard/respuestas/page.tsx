"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

type CannedResponse = {
  id: string
  category: string
  title: string
  content: string
  created_at: string
}

const EMPTY: Omit<CannedResponse, "id" | "created_at"> = {
  category: "",
  title: "",
  content: "",
}

export default function RespuestasPage() {
  const [items, setItems]         = useState<CannedResponse[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [showForm, setShowForm]   = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("canned_responses")
      .select("*")
      .order("category")
      .order("title")
    setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (showForm) setTimeout(() => titleRef.current?.focus(), 50)
  }, [showForm])

  useEffect(() => {
    if (!showForm && !deleteId) return
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowForm(false); setDeleteId(null) } }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [showForm, deleteId])

  function openNew() {
    setEditingId(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(item: CannedResponse) {
    setEditingId(item.id)
    setForm({ category: item.category, title: item.title, content: item.content })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return
    setSaving(true)
    if (editingId) {
      await supabase.from("canned_responses").update({
        category: form.category.trim() || "General",
        title:    form.title.trim(),
        content:  form.content.trim(),
      }).eq("id", editingId)
    } else {
      await supabase.from("canned_responses").insert({
        category: form.category.trim() || "General",
        title:    form.title.trim(),
        content:  form.content.trim(),
      })
    }
    setSaving(false)
    setShowForm(false)
    load()
  }

  async function handleDelete(id: string) {
    await supabase.from("canned_responses").delete().eq("id", id)
    setDeleteId(null)
    load()
  }

  // Categorías únicas
  const categories = Array.from(new Set(items.map((i) => i.category))).sort()

  const filtered = items.filter((item) => {
    if (catFilter !== "all" && item.category !== catFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
    }
    return true
  })

  // Agrupar por categoría
  const grouped = filtered.reduce<Record<string, CannedResponse[]>>((acc, item) => {
    ;(acc[item.category] = acc[item.category] || []).push(item)
    return acc
  }, {})

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flex: "0 0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Respuestas prediseñadas</h1>
          {!loading && (
            <span style={{ fontSize: 13, color: "#6b7280" }}>
              {filtered.length} {filtered.length === 1 ? "respuesta" : "respuestas"}
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 300 }}>
          <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar respuesta…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Category filter */}
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", outline: "none", cursor: "pointer" }}
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={openNew}
            style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#111827", color: "white", cursor: "pointer" }}
          >
            + Nueva respuesta
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
            Cargando…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 8 }}>
            <span style={{ fontSize: 40 }}>⚡</span>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
              {search || catFilter !== "all" ? "No hay respuestas que coincidan" : "Aún no hay respuestas prediseñadas"}
            </p>
            {!search && catFilter === "all" && (
              <button onClick={openNew} style={{ marginTop: 4, fontSize: 13, color: "#2563eb", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Crear la primera
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                {/* Category header */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat}</span>
                  <span style={{ fontSize: 11, color: "#9ca3af", background: "#f3f4f6", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>{catItems.length}</span>
                  <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                </div>

                {/* Cards grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {catItems.map((item) => (
                    <div
                      key={item.id}
                      style={{ background: "white", borderRadius: 10, border: "1px solid #e5e7eb", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, position: "relative" }}
                    >
                      {/* Title row */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "#111827", lineHeight: 1.4 }}>{item.title}</span>
                      </div>

                      {/* Content preview */}
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {item.content}
                      </p>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <button
                          onClick={() => openEdit(item)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 12, color: "#374151", fontWeight: 500 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteId(item.id)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", fontSize: 12, color: "#ef4444", fontWeight: 500 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
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

      {/* ── Modal crear / editar ── */}
      {showForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div style={{ width: "min(520px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>

            {/* Modal header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editingId ? "Editar respuesta" : "Nueva respuesta"}</h2>
              <button onClick={() => setShowForm(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Categoría</span>
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Ej: Saludos, Citas, Pagos…"
                  list="categories-list"
                  style={inputStyle}
                />
                <datalist id="categories-list">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Título <span style={{ color: "#ef4444" }}>*</span></span>
                <input
                  ref={titleRef}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Nombre corto descriptivo"
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>Contenido <span style={{ color: "#ef4444" }}>*</span></span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  placeholder="Texto del mensaje. Puedes usar {{variable}} como marcadores."
                  rows={5}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>Puedes usar {"{{variable}}"} como marcadores de posición</span>
              </label>
            </div>

            {/* Modal footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", color: "#374151" }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.content.trim()}
                style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: saving || !form.title.trim() || !form.content.trim() ? "#9ca3af" : "#111827", color: "white", cursor: saving ? "wait" : "pointer" }}
              >
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear respuesta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal confirmar eliminación ── */}
      {deleteId && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteId(null) }}
        >
          <div style={{ width: "min(400px, 100%)", background: "white", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: 24 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>¿Eliminar respuesta?</h2>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6b7280" }}>
              Esta acción no se puede deshacer. La respuesta será eliminada permanentemente.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setDeleteId(null)} style={{ padding: "7px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "white", cursor: "pointer", color: "#374151" }}>
                Cancelar
              </button>
              <button onClick={() => handleDelete(deleteId)} style={{ padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: "#ef4444", color: "white", cursor: "pointer" }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
}

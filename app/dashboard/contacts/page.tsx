"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

type Contact = {
  id?: string
  first_name: string
  last_name: string
  email: string
  phone: string
  company: string
  status: string
}

function contactFullName(c: Contact | null | undefined, fallback = "Contacto"): string {
  if (!c) return fallback
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
  return full || fallback
}

type MetaTemplate = {
  name: string
  status: string
  category: string
  language: string | { code?: string }
  components?: Array<{
    type: string
    text?: string | { body?: string }
    buttons?: Array<{ type: string; text?: string; url?: string }>
  }>
}

function getComponentText(comp: { text?: string | { body?: string } } | undefined): string {
  if (!comp?.text) return ""
  return typeof comp.text === "string" ? comp.text : comp.text?.body ?? ""
}

function countTemplateVariables(template: MetaTemplate): number {
  const bodyComp = template.components?.find((c) => c.type.toUpperCase() === "BODY")
  const text = getComponentText(bodyComp)
  const matches = text.match(/\{\{\d+\}\}/g)
  return matches ? matches.length : 0
}

function buildParametersForContact(contact: Contact, varCount: number): string[] {
  const pool = [contactFullName(contact), contact.email, contact.phone, contact.company, contact.status]
  return Array.from({ length: varCount }, (_, i) => pool[i] ?? `variable_${i + 1}`)
}

function renderTemplateText(template: MetaTemplate, contact: Contact): string {
  const bodyComp = template.components?.find((c) => c.type.toUpperCase() === "BODY")
  let text = getComponentText(bodyComp)
  if (!text) return template.name
  const pool = [contactFullName(contact), contact.email, contact.phone, contact.company, contact.status]
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => pool[parseInt(n) - 1] ?? `{{${n}}}`)
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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "Lead":      { bg: "#dbeafe", color: "#1d4ed8" },
  "Cliente":   { bg: "#d1fae5", color: "#065f46" },
  "Prospecto": { bg: "#fef3c7", color: "#92400e" },
}

type SortCol = "first_name" | "email" | "phone" | "company" | "status"
type SortDir = "asc" | "desc"

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortCol, setSortCol] = useState<SortCol>("first_name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(() => new Set())
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [form, setForm] = useState<Contact>({ first_name: "", last_name: "", email: "", phone: "", company: "", status: "" })
  const [showForm, setShowForm] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<MetaTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [importingCsv, setImportingCsv] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from("profiles").select("organization_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => { if (data?.organization_id) setOrgId(data.organization_id) })
    })
  }, [])

  async function loadContacts() {
    setLoading(true)
    const { data, error } = await supabase.from("contacts").select("*").order("created_at", { ascending: false })
    if (error) console.error("Error loading contacts:", error)
    else setContacts(data || [])
    setLoading(false)
  }

  useEffect(() => { loadContacts() }, [])

  const contactKey = (c: Contact) => c.id ?? `${c.email}|${c.phone}|${c.first_name}|${c.last_name}`

  const allContactIds = useMemo(() => contacts.map((c) => c.id).filter(Boolean) as string[], [contacts])
  const allSelected = allContactIds.length > 0 && allContactIds.every((id) => selectedContactIds.has(id))
  const someSelected = allContactIds.some((id) => selectedContactIds.has(id))

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  // Filtrado y ordenado
  const filtered = useMemo(() => {
    let list = contacts.filter((c) => {
      const q = search.toLowerCase()
      const matchSearch = !q || contactFullName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)
      const matchStatus = statusFilter === "all" || c.status === statusFilter
      return matchSearch && matchStatus
    })
    list = [...list].sort((a, b) => {
      const av = (a[sortCol] ?? "").toLowerCase()
      const bv = (b[sortCol] ?? "").toLowerCase()
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    return list
  }, [contacts, search, statusFilter, sortCol, sortDir])

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortCol(col); setSortDir("asc") }
  }

  function SortArrow({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span style={{ opacity: 0.3 }}>↕</span>
    return <span>{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  function toggleOne(id: string, checked: boolean) {
    setSelectedContactIds((prev) => { const n = new Set(prev); checked ? n.add(id) : n.delete(id); return n })
  }
  function toggleAll(checked: boolean) {
    setSelectedContactIds(() => checked ? new Set(allContactIds) : new Set())
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function resetForm() { setForm({ first_name: "", last_name: "", email: "", phone: "", company: "", status: "" }); setEditingContactId(null) }
  function closeModal() { setShowForm(false); resetForm() }

  useEffect(() => {
    if (!showForm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeModal() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm])

  function startEditing(contact: Contact) {
    if (!contact.id) return
    setEditingContactId(contact.id)
    setForm({ id: contact.id, first_name: contact.first_name ?? "", last_name: contact.last_name ?? "", email: contact.email ?? "", phone: contact.phone ?? "", company: contact.company ?? "", status: contact.status ?? "" })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.email.trim() || !form.phone.trim() || !form.company.trim() || !form.status.trim()) {
      alert("Completa todos los campos"); return
    }

    // Normalizar teléfono al formato "+número"
    const normalizedPhone = form.phone.trim().startsWith("+") ? form.phone.trim() : `+${form.phone.trim()}`

    if (!editingContactId) {
      // Verificar que no exista otro contacto con el mismo teléfono en la org
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .eq("phone", normalizedPhone)
        .eq("organization_id", orgId)
        .maybeSingle()
      if (existing) {
        alert(`Ya existe un contacto con ese teléfono: ${[existing.first_name, existing.last_name].filter(Boolean).join(" ")}`)
        return
      }
    } else {
      // Al editar, verificar que el nuevo teléfono no lo use otro contacto
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("phone", normalizedPhone)
        .eq("organization_id", orgId)
        .neq("id", editingContactId)
        .maybeSingle()
      if (existing) {
        alert("Ese número de teléfono ya está registrado en otro contacto.")
        return
      }
    }

    const payload = { ...form, phone: normalizedPhone }
    const { error } = editingContactId
      ? await supabase.from("contacts").update({ first_name: payload.first_name, last_name: payload.last_name, email: payload.email, phone: payload.phone, company: payload.company, status: payload.status }).eq("id", editingContactId)
      : await supabase.from("contacts").insert([{ ...payload, organization_id: orgId }])
    if (error) { alert((editingContactId ? "Error actualizando: " : "Error guardando: ") + error.message); return }
    resetForm(); setShowForm(false); loadContacts()
  }

  async function deleteSelected() {
    const ids = allContactIds.filter((id) => selectedContactIds.has(id))
    if (!ids.length) return
    if (!confirm(`¿Eliminar ${ids.length} contacto(s)? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from("contacts").delete().in("id", ids)
    if (error) { alert("Error eliminando: " + error.message); return }
    if (editingContactId && ids.includes(editingContactId)) { resetForm(); setShowForm(false) }
    setSelectedContactIds(new Set()); loadContacts()
  }

  async function openTemplatePicker() {
    setShowTemplatePicker(true); setLoadingTemplates(true)
    try {
      const res = await fetch("/API/list-templates")
      const data = await res.json()
      if (res.ok) setAvailableTemplates(data?.templates ?? [])
      else { alert(data?.error ?? "Error cargando plantillas"); setShowTemplatePicker(false) }
    } catch { alert("Error de red"); setShowTemplatePicker(false) }
    finally { setLoadingTemplates(false) }
  }

  async function sendWithTemplate(template: MetaTemplate) {
    const selected = contacts.filter((c) => c.id && selectedContactIds.has(c.id) && c.phone?.trim())
    if (!selected.length) { alert("Los contactos seleccionados no tienen teléfono válido."); return }
    const varCount = countTemplateVariables(template)
    const lang = typeof template.language === "string" ? template.language : template.language?.code ?? "en_US"
    const recipients = selected.map((c) => ({
      phone:            c.phone,
      parameters:       varCount > 0 ? buildParametersForContact(c, varCount) : [],
      templateRendered: renderTemplateText(template, c),
    }))
    setSendingTemplate(template.name)
    try {
      const res = await fetch("/API/send-whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_name: template.name, template_language: lang, recipients }) })
      const data = await res.json().catch(() => null)
      const ok = data?.results?.filter((r: { ok: boolean }) => r.ok).length ?? 0
      const fail = (data?.results?.length ?? 0) - ok
      alert(`Plantilla "${template.name}" enviada.\nExitosos: ${ok} · Con error: ${fail}`)
      setShowTemplatePicker(false)
    } catch { alert("Error de red al enviar.") }
    finally { setSendingTemplate(null) }
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ""
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) { alert("El CSV debe tener encabezado y al menos un contacto."); return }
    const sep = lines[0].includes(";") ? ";" : ","
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""))
    const hasName = headers.includes("name")
    const hasFirstName = headers.includes("first_name")
    if (!hasName && !hasFirstName) { alert("Faltan columnas: name o first_name"); return }
    const missing = ["email","phone","company","status"].filter((h) => !headers.includes(h))
    if (missing.length) { alert(`Faltan columnas: ${missing.join(", ")}`); return }
    const parsed: Contact[] = []; const skipped: number[] = []
    for (let i = 0; i < lines.length - 1; i++) {
      const cols = lines[i+1].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""))
      const row: Record<string, string> = {}; headers.forEach((h, idx) => { row[h] = cols[idx] ?? "" })
      // Compatibilidad: acepta columna "name" (la divide) o "first_name"/"last_name"
      let firstName = row.first_name ?? ""
      let lastName  = row.last_name  ?? ""
      if (!firstName && row.name) {
        const parts = row.name.trim().split(/\s+/)
        firstName = parts[0] ?? ""
        lastName  = parts.slice(1).join(" ")
      }
      if (!firstName || !row.email || !row.phone) { skipped.push(i + 2); continue }
      // Normalizar teléfono al formato "+número"
      const normalizedPhone = row.phone.trim().startsWith("+") ? row.phone.trim() : `+${row.phone.trim()}`
      parsed.push({ first_name: firstName, last_name: lastName, email: row.email, phone: normalizedPhone, company: row.company ?? "", status: row.status ?? "" })
    }
    if (!parsed.length) { alert("No hay filas válidas."); return }
    setImportingCsv(true)
    const withOrg = orgId ? parsed.map((c) => ({ ...c, organization_id: orgId })) : parsed
    // Upsert: si el teléfono ya existe en la org, actualiza los datos del contacto
    const { error } = await supabase.from("contacts").upsert(withOrg, {
      onConflict: "organization_id,phone",
      ignoreDuplicates: false,
    })
    setImportingCsv(false)
    if (error) { alert("Error importando: " + error.message); return }
    alert(`Se importaron/actualizaron ${parsed.length} contacto(s).${skipped.length ? `\n${skipped.length} omitidas.` : ""}`)
    loadContacts()
  }

  useEffect(() => {
    if (!showTemplatePicker) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowTemplatePicker(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [showTemplatePicker])

  const hasSelection = selectedContactIds.size > 0

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f9fafb" }}>

      {/* ── Top bar ── */}
      <div style={{ background: "white", borderBottom: "1px solid #e5e7eb", padding: "14px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Contactos</h1>
            <span style={{ fontSize: 12, background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: 12, fontWeight: 500 }}>
              {filtered.length} contactos
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Enviar */}
            <button
              type="button"
              onClick={openTemplatePicker}
              disabled={!hasSelection}
              title={hasSelection ? "Enviar plantilla" : "Selecciona contactos"}
              style={{ ...actionBtn, background: hasSelection ? "#2563eb" : "#e5e7eb", color: hasSelection ? "white" : "#9ca3af", cursor: hasSelection ? "pointer" : "not-allowed" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {hasSelection && <span style={{ fontSize: 13 }}>Enviar ({selectedContactIds.size})</span>}
            </button>

            {/* Eliminar */}
            <button
              type="button"
              onClick={deleteSelected}
              disabled={!hasSelection}
              title={hasSelection ? "Eliminar seleccionados" : "Selecciona contactos"}
              style={{ ...actionBtn, background: hasSelection ? "#fee2e2" : "#e5e7eb", color: hasSelection ? "#991b1b" : "#9ca3af", border: hasSelection ? "1px solid #fecaca" : "1px solid transparent", cursor: hasSelection ? "pointer" : "not-allowed" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 6L7 21H17L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 11V17M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {hasSelection && <span style={{ fontSize: 13 }}>Eliminar ({selectedContactIds.size})</span>}
            </button>

            {/* CSV */}
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvImport} />
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              disabled={importingCsv}
              title="Importar desde CSV"
              style={{ ...outlineBtn }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 16L12 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 11L12 8L15 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 16V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {importingCsv ? "Importando…" : "CSV"}
            </button>

            {/* Nuevo contacto */}
            <button
              type="button"
              onClick={() => { if (showForm) { closeModal() } else { resetForm(); setShowForm(true) } }}
              style={{ ...primaryBtn }}
            >
              + Nuevo contacto
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto…"
              style={{ ...filterInput, paddingLeft: 28, width: 200 }}
            />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={filterInput}>
            <option value="all">Todos los status</option>
            <option value="Lead">Lead</option>
            <option value="Cliente">Cliente</option>
            <option value="Prospecto">Prospecto</option>
          </select>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
            Cargando contactos…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", gap: 10 }}>
            <span style={{ fontSize: 40 }}>👥</span>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No hay contactos que coincidan</p>
            <p style={{ margin: 0, fontSize: 13 }}>Intenta cambiar los filtros o agrega un nuevo contacto</p>
          </div>
        ) : (
          <div style={{ background: "white", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ ...th, width: 44 }}>
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleAll(e.target.checked)}
                      aria-label="Seleccionar todos"
                      style={{ accentColor: "#2563eb", cursor: "pointer" }}
                    />
                  </th>
                  <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("first_name")}>Nombre <SortArrow col="first_name" /></th>
                  <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("email")}>Correo <SortArrow col="email" /></th>
                  <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("phone")}>Teléfono <SortArrow col="phone" /></th>
                  <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("company")}>Empresa <SortArrow col="company" /></th>
                  <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("status")}>Status <SortArrow col="status" /></th>
                  <th style={th}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((contact) => {
                  const isSelected = !!contact.id && selectedContactIds.has(contact.id)
                  const statusStyle = STATUS_COLORS[contact.status] ?? { bg: "#f3f4f6", color: "#6b7280" }
                  return (
                    <tr
                      key={contactKey(contact)}
                      style={{ borderBottom: "1px solid #f3f4f6", background: isSelected ? "#eff6ff" : "white" }}
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#f9fafb" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? "#eff6ff" : "white" }}
                    >
                      <td style={{ ...td, width: 44 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!contact.id}
                          onChange={(e) => contact.id && toggleOne(contact.id, e.target.checked)}
                          aria-label={`Seleccionar ${contactFullName(contact)}`}
                          style={{ accentColor: "#2563eb", cursor: "pointer" }}
                        />
                      </td>

                      {/* Nombre con avatar */}
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: avatarColor(contact.id ?? contactFullName(contact)),
                            color: "white", display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {initials(contactFullName(contact))}
                          </div>
                          <span style={{ fontWeight: 500, fontSize: 13, color: "#111827" }}>{contactFullName(contact)}</span>
                        </div>
                      </td>

                      <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{contact.email}</td>
                      <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{contact.phone}</td>
                      <td style={{ ...td, color: "#6b7280", fontSize: 13 }}>{contact.company}</td>

                      {/* Status badge */}
                      <td style={td}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20,
                          background: statusStyle.bg, color: statusStyle.color,
                          fontSize: 12, fontWeight: 600,
                        }}>
                          {contact.status || "—"}
                        </span>
                      </td>

                      {/* Editar */}
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => startEditing(contact)}
                          aria-label={`Editar ${contactFullName(contact)}`}
                          title="Editar"
                          style={{ background: "transparent", border: "1px solid #e5e7eb", padding: "5px 9px", borderRadius: 7, cursor: "pointer", color: "#6b7280", display: "inline-flex", alignItems: "center" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#f3f4f6" }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16.5 3.5C16.8978 3.10217 17.4374 2.87866 18 2.87866C18.5626 2.87866 19.1022 3.10217 19.5 3.5C19.8978 3.89782 20.1213 4.43739 20.1213 5C20.1213 5.56261 19.8978 6.10217 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal nuevo/editar contacto ── */}
      {showForm && (
        <div role="dialog" aria-modal="true" style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal() }}>
          <div style={modalCard}>
            <div style={modalHeader}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{editingContactId ? "Editar contacto" : "Nuevo contacto"}</h2>
              <button type="button" onClick={closeModal} style={closeBtn} aria-label="Cerrar">×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <input type="text" name="first_name" placeholder="Nombre" value={form.first_name} onChange={handleChange} style={inputStyle} autoFocus />
                <input type="text" name="last_name" placeholder="Apellido" value={form.last_name} onChange={handleChange} style={inputStyle} />
                <input type="email" name="email" placeholder="Correo" value={form.email} onChange={handleChange} style={inputStyle} />
                <input type="text" name="phone" placeholder="Teléfono" value={form.phone} onChange={handleChange} style={inputStyle} />
                <input type="text" name="company" placeholder="Empresa" value={form.company} onChange={handleChange} style={inputStyle} />
              </div>
              <select name="status" value={form.status} onChange={handleChange} style={{ ...inputStyle, marginBottom: 16 }}>
                <option value="">Selecciona un status</option>
                <option value="Lead">Lead</option>
                <option value="Cliente">Cliente</option>
                <option value="Prospecto">Prospecto</option>
              </select>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeModal} style={secondaryBtn}>Cancelar</button>
                <button type="submit" style={primaryBtn}>{editingContactId ? "Actualizar" : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal elegir plantilla ── */}
      {showTemplatePicker && (
        <div role="dialog" aria-modal="true" style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowTemplatePicker(false) }}>
          <div style={{ ...modalCard, width: "min(600px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={modalHeader}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Elegir plantilla</h2>
              <button type="button" onClick={() => setShowTemplatePicker(false)} style={closeBtn} aria-label="Cerrar">×</button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              Se enviará a {selectedContactIds.size} contacto(s). Las variables se llenarán con los datos de cada contacto.
            </p>
            {loadingTemplates ? (
              <p style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}>Cargando plantillas…</p>
            ) : availableTemplates.length === 0 ? (
              <p style={{ textAlign: "center", color: "#9ca3af", padding: 24 }}>No hay plantillas disponibles.</p>
            ) : (
              <div style={{ overflow: "auto", flex: 1 }}>
                {availableTemplates.map((t) => {
                  const bodyComp = t.components?.find((c) => c.type.toUpperCase() === "BODY")
                  const bodyText = getComponentText(bodyComp)
                  const varCount = countTemplateVariables(t)
                  const lang = typeof t.language === "string" ? t.language : t.language?.code ?? ""
                  return (
                    <div key={`${t.name}-${lang}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{t.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{t.category} · {lang}{varCount > 0 && ` · ${varCount} variable(s)`}</div>
                        {bodyText && <div style={{ fontSize: 13, color: "#4b5563", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{bodyText}</div>}
                      </div>
                      <button
                        type="button"
                        disabled={sendingTemplate !== null}
                        onClick={() => sendWithTemplate(t)}
                        style={{ ...primaryBtn, flexShrink: 0, opacity: sendingTemplate !== null ? 0.6 : 1, cursor: sendingTemplate !== null ? "wait" : "pointer" }}
                      >
                        {sendingTemplate === t.name ? "Enviando…" : "Enviar"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const filterInput: React.CSSProperties = {
  padding: "6px 10px", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "white", outline: "none",
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 14px", fontSize: 13, borderRadius: 8, border: "none",
  background: "#111827", color: "white", cursor: "pointer", fontWeight: 500,
}

const outlineBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 12px", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "white", color: "#374151", cursor: "pointer",
}

const actionBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 12px", borderRadius: 8, border: "1px solid transparent",
  fontSize: 13, fontWeight: 500, transition: "opacity 150ms",
}

const th: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600,
  color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap",
}

const td: React.CSSProperties = {
  padding: "10px 14px", verticalAlign: "middle",
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(17,24,39,0.55)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50,
}

const modalCard: React.CSSProperties = {
  width: "min(560px, 100%)", background: "white", borderRadius: 14,
  border: "1px solid #e5e7eb", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", padding: 20,
}

const modalHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
}

const closeBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: "1px solid #e5e7eb",
  background: "white", cursor: "pointer", fontSize: 20, lineHeight: "30px",
  display: "flex", alignItems: "center", justifyContent: "center",
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb",
  borderRadius: 8, fontSize: 13, boxSizing: "border-box", outline: "none",
}

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px", fontSize: 13, borderRadius: 8,
  border: "1px solid #e5e7eb", background: "white", color: "#374151", cursor: "pointer",
}

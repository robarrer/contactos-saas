"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"

type Contact = {
  id?: string
  name: string
  email: string
  phone: string
  company: string
  status: string
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
  const pool = [contact.name, contact.email, contact.phone, contact.company, contact.status]
  return Array.from({ length: varCount }, (_, i) => pool[i] ?? `variable_${i + 1}`)
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(
    () => new Set()
  )
  const selectAllRef = useRef<HTMLInputElement>(null)
  const [editingContactId, setEditingContactId] = useState<string | null>(null)

  const [form, setForm] = useState<Contact>({
    name: "",
    email: "",
    phone: "",
    company: "",
    status: "",
  })

  const [showForm, setShowForm] = useState(false)
  const modalCardRef = useRef<HTMLDivElement>(null)

  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<MetaTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [sendingTemplate, setSendingTemplate] = useState<string | null>(null)

  const csvInputRef = useRef<HTMLInputElement>(null)
  const [importingCsv, setImportingCsv] = useState(false)

  async function loadContacts() {
    setLoading(true)

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })

      if (error) {
        console.error("Error loading contacts:", error)
        alert("Error cargando contactos: " + error.message)
      } else {
        setContacts(data || [])
      }

    setLoading(false)
  }

  useEffect(() => {
    loadContacts()
  }, [])

  const contactKey = (contact: Contact) =>
    contact.id ?? `${contact.email}|${contact.phone}|${contact.name}`

  const allContactIds = useMemo(
    () => contacts.map((c) => c.id).filter(Boolean) as string[],
    [contacts]
  )

  const allSelected =
    allContactIds.length > 0 && allContactIds.every((id) => selectedContactIds.has(id))
  const someSelected = allContactIds.some((id) => selectedContactIds.has(id))

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  function toggleOneContactSelection(id: string, checked: boolean) {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAllContactsSelection(checked: boolean) {
    setSelectedContactIds(() => {
      if (!checked) return new Set()
      return new Set(allContactIds)
    })
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function resetFormAndEditingState() {
    setForm({
      name: "",
      email: "",
      phone: "",
      company: "",
      status: "",
    })
    setEditingContactId(null)
  }

  function closeModal() {
    setShowForm(false)
    resetFormAndEditingState()
  }

  useEffect(() => {
    if (!showForm) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm])

  function startEditing(contact: Contact) {
    if (!contact.id) {
      alert("Este contacto no tiene id, no se puede editar.")
      return
    }

    setEditingContactId(contact.id)
    setForm({
      id: contact.id,
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      company: contact.company ?? "",
      status: contact.status ?? "",
    })
    setShowForm(true)
  }

  async function openTemplatePicker() {
    setShowTemplatePicker(true)
    setLoadingTemplates(true)

    try {
      const res = await fetch("/API/list-templates")
      const data = await res.json()
      if (res.ok) {
        setAvailableTemplates(data?.templates ?? [])
      } else {
        alert(data?.error ?? "Error cargando plantillas")
        setShowTemplatePicker(false)
      }
    } catch {
      alert("Error de red al cargar plantillas")
      setShowTemplatePicker(false)
    } finally {
      setLoadingTemplates(false)
    }
  }

  async function sendWithTemplate(template: MetaTemplate) {
    const selectedIds = allContactIds.filter((id) => selectedContactIds.has(id))
    const selectedContacts = contacts.filter(
      (c) => c.id && selectedIds.includes(c.id)
    )

    const validContacts = selectedContacts.filter(
      (c) => c.phone && c.phone.trim().length > 0
    )

    if (validContacts.length === 0) {
      alert("Los contactos seleccionados no tienen teléfono válido.")
      return
    }

    const varCount = countTemplateVariables(template)
    const lang =
      typeof template.language === "string"
        ? template.language
        : template.language?.code ?? "en_US"

    const recipients = validContacts.map((c) => ({
      phone: c.phone,
      parameters: varCount > 0 ? buildParametersForContact(c, varCount) : [],
    }))

    setSendingTemplate(template.name)

    try {
      const res = await fetch("/API/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: template.name,
          template_language: lang,
          recipients,
        }),
      })

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        console.error("Error en API send-whatsapp:", errorBody)
        alert("Hubo un problema enviando el mensaje por WhatsApp.")
        return
      }

      const data = await res.json().catch(() => null)
      console.log("Respuesta de send-whatsapp:", data)

      const okCount = data?.results?.filter((r: { ok: boolean }) => r.ok).length ?? 0
      const failCount = (data?.results?.length ?? 0) - okCount

      alert(
        `Plantilla "${template.name}" enviada.\n` +
          `Exitosos: ${okCount} · Con error: ${failCount}`
      )

      setShowTemplatePicker(false)
    } catch (error) {
      console.error("Error llamando a /API/send-whatsapp:", error)
      alert("Error de red al intentar enviar el WhatsApp.")
    } finally {
      setSendingTemplate(null)
    }
  }

  async function deleteSelectedContacts() {
    const ids = allContactIds.filter((id) => selectedContactIds.has(id))
    if (ids.length === 0) return

    const ok = confirm(
      `¿Eliminar ${ids.length} contacto(s) seleccionado(s)? Esta acción no se puede deshacer.`
    )
    if (!ok) return

    const { error } = await supabase.from("contacts").delete().in("id", ids)

    if (error) {
      console.error("Error deleting selected contacts:", error)
      alert("Error eliminando contactos: " + error.message)
      return
    }

    if (editingContactId && ids.includes(editingContactId)) {
      resetFormAndEditingState()
      setShowForm(false)
    }

    setSelectedContactIds(new Set())
    loadContacts()
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Limpiar el input para permitir volver a subir el mismo archivo
    e.target.value = ""

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

    if (lines.length < 2) {
      alert("El archivo CSV debe tener al menos una fila de encabezado y un contacto.")
      return
    }

    const EXPECTED_HEADERS = ["name", "email", "phone", "company", "status"]

    // Detectar separador (coma o punto y coma)
    const sep = lines[0].includes(";") ? ";" : ","
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""))

    const missingCols = EXPECTED_HEADERS.filter((h) => !headers.includes(h))
    if (missingCols.length > 0) {
      alert(
        `El CSV le faltan las columnas: ${missingCols.join(", ")}.\n` +
          `Columnas esperadas: ${EXPECTED_HEADERS.join(", ")}`
      )
      return
    }

    const dataRows = lines.slice(1)
    const parsed: Contact[] = []
    const skipped: number[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""))
      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = cols[idx] ?? "" })

      if (!row.name || !row.email || !row.phone) {
        skipped.push(i + 2) // +2: línea 1 = header, base 1
        continue
      }

      parsed.push({
        name: row.name,
        email: row.email,
        phone: row.phone,
        company: row.company ?? "",
        status: row.status ?? "",
      })
    }

    if (parsed.length === 0) {
      alert("No se encontraron filas válidas en el CSV (se requiere al menos name, email y phone).")
      return
    }

    setImportingCsv(true)

    const { error } = await supabase.from("contacts").insert(parsed)

    setImportingCsv(false)

    if (error) {
      console.error("Error importando CSV:", error)
      alert("Error importando contactos: " + error.message)
      return
    }

    let msg = `Se importaron ${parsed.length} contacto(s) correctamente.`
    if (skipped.length > 0) {
      msg += `\n${skipped.length} fila(s) omitidas por datos incompletos (líneas: ${skipped.slice(0, 10).join(", ")}${skipped.length > 10 ? "…" : ""}).`
    }
    alert(msg)
    loadContacts()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !form.name.trim() ||
      !form.email.trim() ||
      !form.phone.trim() ||
      !form.company.trim() ||
      !form.status.trim()
    ) {
      alert("Completa todos los campos")
      return
    }

    const { error } = editingContactId
      ? await supabase
          .from("contacts")
          .update({
            name: form.name,
            email: form.email,
            phone: form.phone,
            company: form.company,
            status: form.status,
          })
          .eq("id", editingContactId)
      : await supabase.from("contacts").insert([form])

    if (error) {
      console.error("Error saving contact:", error)
      alert(
        (editingContactId ? "Error actualizando contacto: " : "Error guardando contacto: ") +
          error.message
      )
      return
    }

    resetFormAndEditingState()

    setShowForm(false)
    loadContacts()
  }

  useEffect(() => {
    if (!showTemplatePicker) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowTemplatePicker(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [showTemplatePicker])

  return (
    <div>
      {showTemplatePicker && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Elegir plantilla"
          style={modalOverlayStyle}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowTemplatePicker(false)
          }}
        >
          <div
            style={{
              ...modalCardStyle,
              width: "min(600px, 100%)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Elegir plantilla para enviar</h2>
              <button
                type="button"
                onClick={() => setShowTemplatePicker(false)}
                style={modalCloseButtonStyle}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
              Se enviará a {selectedContactIds.size} contacto(s) seleccionado(s).
              Las variables se llenarán con los datos de cada contacto (nombre, correo,
              teléfono, empresa, status). Si no hay suficientes, se usarán valores de ejemplo.
            </p>

            {loadingTemplates ? (
              <p style={{ color: "#6b7280", textAlign: "center", padding: 24 }}>
                Cargando plantillas…
              </p>
            ) : availableTemplates.length === 0 ? (
              <p style={{ color: "#6b7280", textAlign: "center", padding: 24 }}>
                No hay plantillas disponibles.
              </p>
            ) : (
              <div style={{ overflow: "auto", flex: 1 }}>
                {availableTemplates.map((t) => {
                  const bodyComp = t.components?.find(
                    (c) => c.type.toUpperCase() === "BODY"
                  )
                  const bodyText = getComponentText(bodyComp)
                  const varCount = countTemplateVariables(t)
                  const lang =
                    typeof t.language === "string"
                      ? t.language
                      : t.language?.code ?? ""

                  return (
                    <div
                      key={`${t.name}-${lang}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                          {t.category} · {lang}
                          {varCount > 0 && ` · ${varCount} variable(s)`}
                        </div>
                        {bodyText && (
                          <div
                            style={{
                              fontSize: 13,
                              color: "#4b5563",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {bodyText}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={sendingTemplate !== null}
                        onClick={() => sendWithTemplate(t)}
                        style={{
                          ...primaryButtonStyle,
                          flexShrink: 0,
                          fontSize: 13,
                          padding: "8px 14px",
                          opacity: sendingTemplate !== null ? 0.6 : 1,
                          cursor: sendingTemplate !== null ? "wait" : "pointer",
                        }}
                      >
                        {sendingTemplate === `${t.name}` ? "Enviando…" : "Enviar"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1>Contactos</h1>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={openTemplatePicker}
            disabled={selectedContactIds.size === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: selectedContactIds.size === 0 ? "#e5e7eb" : "#2563eb",
              color: selectedContactIds.size === 0 ? "#6b7280" : "white",
              border: "none",
              padding: "10px 14px",
              borderRadius: "8px",
              cursor: selectedContactIds.size === 0 ? "not-allowed" : "pointer",
              opacity: selectedContactIds.size === 0 ? 0.9 : 1,
            }}
            aria-disabled={selectedContactIds.size === 0}
            aria-label="Enviar contactos seleccionados"
            title={
              selectedContactIds.size === 0
                ? "Selecciona uno o más contactos"
                : "Enviar contactos seleccionados"
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M22 2L11 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 2L15 22L11 13L2 9L22 2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            onClick={deleteSelectedContacts}
            disabled={selectedContactIds.size === 0}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: selectedContactIds.size === 0 ? "#e5e7eb" : "#fee2e2",
              color: selectedContactIds.size === 0 ? "#6b7280" : "#991b1b",
              border: selectedContactIds.size === 0 ? "none" : "1px solid #fecaca",
              padding: "10px 14px",
              borderRadius: "8px",
              cursor: selectedContactIds.size === 0 ? "not-allowed" : "pointer",
              opacity: selectedContactIds.size === 0 ? 0.9 : 1,
            }}
            aria-disabled={selectedContactIds.size === 0}
            aria-label="Eliminar contactos seleccionados"
            title={
              selectedContactIds.size === 0
                ? "Selecciona uno o más contactos"
                : "Eliminar contactos seleccionados"
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M3 6H21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 6L7 21H17L18 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 11V17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 11V17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleCsvImport}
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={importingCsv}
            title="Cargar contactos desde un archivo CSV"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: importingCsv ? "#e5e7eb" : "white",
              color: importingCsv ? "#6b7280" : "#111827",
              border: "1px solid #d1d5db",
              padding: "10px 14px",
              borderRadius: "8px",
              cursor: importingCsv ? "wait" : "pointer",
            }}
          >
            {importingCsv ? (
              "Importando…"
            ) : (
              <>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M12 16L12 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 11L12 8L15 11"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M4 16V19C4 19.5523 4.44772 20 5 20H19C19.5523 20 20 19.5523 20 19V16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                CSV
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (showForm) {
                closeModal()
                return
              }
              resetFormAndEditingState()
              setShowForm(true)
            }}
            style={{
              background: "#111827",
              color: "white",
              border: "none",
              padding: "10px 16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            {showForm ? "Cerrar" : "Nuevo contacto"}
          </button>
        </div>
      </div>

      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingContactId ? "Editar contacto" : "Nuevo contacto"}
          style={modalOverlayStyle}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div ref={modalCardRef} style={modalCardStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                {editingContactId ? "Editar contacto" : "Nuevo contacto"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                style={modalCloseButtonStyle}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={formRowStyle}>
                <input
                  type="text"
                  name="name"
                  placeholder="Nombre"
                  value={form.name}
                  onChange={handleChange}
                  style={inputStyle}
                  autoFocus
                />

                <input
                  type="email"
                  name="email"
                  placeholder="Correo"
                  value={form.email}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>

              <div style={formRowStyle}>
                <input
                  type="text"
                  name="phone"
                  placeholder="Teléfono"
                  value={form.phone}
                  onChange={handleChange}
                  style={inputStyle}
                />

                <input
                  type="text"
                  name="company"
                  placeholder="Empresa"
                  value={form.company}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="">Selecciona un status</option>
                  <option value="Lead">Lead</option>
                  <option value="Cliente">Cliente</option>
                  <option value="Prospecto">Prospecto</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={secondaryButtonStyle}
                >
                  Cancelar
                </button>
                <button type="submit" style={primaryButtonStyle}>
                  {editingContactId ? "Actualizar" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <p>Cargando contactos...</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            background: "white",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 44 }}>
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAllContactsSelection(e.target.checked)}
                  aria-label="Seleccionar todos los contactos"
                />
              </th>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Correo</th>
              <th style={thStyle}>Teléfono</th>
              <th style={thStyle}>Empresa</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {contacts.map((contact) => (
              <tr key={contactKey(contact)}>
                <td style={{ ...tdStyle, width: 44 }}>
                  <input
                    type="checkbox"
                    checked={!!contact.id && selectedContactIds.has(contact.id)}
                    disabled={!contact.id}
                    onChange={(e) =>
                      contact.id
                        ? toggleOneContactSelection(contact.id, e.target.checked)
                        : undefined
                    }
                    aria-label={`Seleccionar ${contact.name}`}
                  />
                </td>
                <td style={tdStyle}>{contact.name}</td>
                <td style={tdStyle}>{contact.email}</td>
                <td style={tdStyle}>{contact.phone}</td>
                <td style={tdStyle}>{contact.company}</td>
                <td style={tdStyle}>{contact.status}</td>
                <td style={tdStyle}>
                  <button
                    type="button"
                    onClick={() => startEditing(contact)}
                    aria-label={`Editar ${contact.name}`}
                    title="Editar"
                    style={{
                      background: "transparent",
                      border: "1px solid #d1d5db",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 20H21"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M16.5 3.5C16.8978 3.10217 17.4374 2.87866 18 2.87866C18.5626 2.87866 19.1022 3.10217 19.5 3.5C19.8978 3.89782 20.1213 4.43739 20.1213 5C20.1213 5.56261 19.8978 6.10217 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const formRowStyle = {
  display: "flex",
  gap: "12px",
  marginBottom: "12px",
}

const inputStyle = {
  width: "100%",
  padding: "10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
}

const thStyle = {
  textAlign: "left" as const,
  padding: "12px",
  borderBottom: "1px solid #ddd",
  background: "#f3f4f6",
}

const tdStyle = {
  padding: "12px",
  borderBottom: "1px solid #eee",
}

const modalOverlayStyle = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(17, 24, 39, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
}

const modalCardStyle = {
  width: "min(720px, 100%)",
  background: "white",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
  padding: 16,
}

const modalHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
}

const modalCloseButtonStyle = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  fontSize: 20,
  lineHeight: "32px",
}

const primaryButtonStyle = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "10px 16px",
  borderRadius: "8px",
  cursor: "pointer",
}

const secondaryButtonStyle = {
  background: "white",
  color: "#111827",
  border: "1px solid #d1d5db",
  padding: "10px 16px",
  borderRadius: "8px",
  cursor: "pointer",
}
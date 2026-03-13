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

  async function loadContacts() {
    setLoading(true)

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading contacts:", error)
      alert("Error cargando contactos")
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

  function sendSelectedContacts() {
    const selected = allContactIds.filter((id) => selectedContactIds.has(id))

    // Acción placeholder: aquí puedes integrar tu envío real (API, email, etc.)
    console.log("Contactos seleccionados para enviar:", selected)
    alert(`Seleccionaste ${selected.length} contacto(s) para enviar.`)
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

  return (
    <div>
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
            onClick={sendSelectedContacts}
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
            Enviar
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

          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                resetFormAndEditingState()
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
        <form
          onSubmit={handleSubmit}
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
            marginBottom: "24px",
            border: "1px solid #e5e7eb",
          }}
        >
          <div style={formRowStyle}>
            <input
              type="text"
              name="name"
              placeholder="Nombre"
              value={form.name}
              onChange={handleChange}
              style={inputStyle}
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

          <button
            type="submit"
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "10px 16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            {editingContactId ? "Actualizar contacto" : "Guardar contacto"}
          </button>
          {editingContactId && (
            <button
              type="button"
              onClick={() => {
                resetFormAndEditingState()
                setShowForm(false)
              }}
              style={{
                marginLeft: "10px",
                background: "white",
                color: "#111827",
                border: "1px solid #d1d5db",
                padding: "10px 16px",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          )}
        </form>
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
                    style={{
                      background: "transparent",
                      border: "1px solid #d1d5db",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      cursor: "pointer",
                    }}
                  >
                    Editar
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
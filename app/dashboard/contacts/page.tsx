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
  const modalCardRef = useRef<HTMLDivElement>(null)

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

  async function sendSelectedContacts() {
    const selectedIds = allContactIds.filter((id) => selectedContactIds.has(id))
    const selectedContacts = contacts.filter(
      (c) => c.id && selectedIds.includes(c.id)
    )
    const phones = selectedContacts
      .map((c) => c.phone)
      .filter((phone) => !!phone && phone.trim().length > 0)

    if (phones.length === 0) {
      alert("Los contactos seleccionados no tienen teléfono válido.")
      return
    }

    try {
      const res = await fetch("/API/send-whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phones }),
      })

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        console.error("Error en API send-whatsapp:", errorBody)
        alert("Hubo un problema enviando el mensaje por WhatsApp.")
        return
      }

      const data = await res.json().catch(() => null)
      console.log("Respuesta de send-whatsapp:", data)
      alert(`Se intentó enviar WhatsApp a ${phones.length} contacto(s).`)
    } catch (error) {
      console.error("Error llamando a /api/send-whatsapp:", error)
      alert("Error de red al intentar enviar el WhatsApp.")
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
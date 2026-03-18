"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/app/lib/supabase"
import type { Conversation, Message, MockContact } from "./mockData"

// ─── Tipos mapeados desde Supabase ────────────────────────────────────────────

type DbConversation = {
  id: string
  contact_id: string
  channel: string
  status: string
  mode: string
  assigned_agent: string | null
  pipeline_stage: string
  unread_count: number
  last_message: string | null
  last_activity: string
  last_inbound_at: string | null
  wa_contact_id: string | null
  created_at: string
}

type DbMessage = {
  id: string
  conversation_id: string
  direction: string
  sender_type: string
  sender_name: string | null
  content_type: string
  content: string | null
  media_url: string | null
  is_internal: boolean
  wa_message_id: string | null
  status: string
  created_at: string
}

type DbContact = {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  company: string | null
  status: string | null
  created_at: string
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapConversation(db: DbConversation): Conversation {
  return {
    id:              db.id,
    contactId:       db.contact_id,
    channel:         (db.channel as Conversation["channel"]) ?? "whatsapp",
    botStatus:       db.mode === "bot" ? "bot" : "human",
    assignedAgentId: db.assigned_agent ?? null,
    pipelineStage:   (db.pipeline_stage as Conversation["pipelineStage"]) ?? "Nuevo contacto",
    unreadCount:     db.unread_count ?? 0,
    lastMessage:     db.last_message ?? "",
    lastActivityAt:  db.last_activity,
    lastInboundAt:   db.last_inbound_at ?? null,
    tags:            [],
  }
}

function mapMessage(db: DbMessage): Message {
  const senderMap: Record<string, Message["sender"]> = {
    contact: "contact",
    agent:   "agent",
    bot:     "bot",
    system:  "bot",
  }
  // Para mensajes de plantilla, content_type = "template"
  // content guarda el texto renderizado, y sender_name puede tener el nombre de la plantilla prefijado
  let templateName: string | undefined
  let templateRendered: string | undefined
  if (db.content_type === "template") {
    // Intentamos extraer el nombre de plantilla del campo sender_name con formato "template:nombre"
    if (db.sender_name?.startsWith("template:")) {
      templateName = db.sender_name.replace("template:", "")
    } else {
      templateName = db.sender_name ?? undefined
    }
    templateRendered = db.content ?? undefined
  }
  return {
    id:               db.id,
    conversationId:   db.conversation_id,
    sender:           senderMap[db.sender_type] ?? "bot",
    type:             (db.content_type as Message["type"]) ?? "text",
    text:             db.content ?? undefined,
    templateName,
    templateRendered,
    isInternal:       db.is_internal,
    timestamp:        db.created_at,
  }
}

function mapContact(db: DbContact): MockContact {
  return {
    id:                 db.id,
    first_name:         db.first_name ?? "",
    last_name:          db.last_name  ?? "",
    phone:              db.phone ?? undefined,
    channels:           ["whatsapp"],
    createdAt:          db.created_at,
    totalConversations: 1,
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useSupabaseInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts, setContacts]           = useState<MockContact[]>([])
  const [messages, setMessages]           = useState<Message[]>([])
  const [loading, setLoading]             = useState(true)
  const [loadingMore, setLoadingMore]     = useState(false)
  const [hasMore, setHasMore]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const activeConvIdRef = useRef<string | null>(null)
  const waMapRef        = useRef<Record<string, string>>({})
  const pageRef         = useRef(0)
  const searchRef       = useRef("")

  // ── Cargar una página de conversaciones ──────────────────────────────────
  const loadPage = useCallback(async (search: string, page: number, replace: boolean) => {
    if (page === 0) replace = true

    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    // Búsqueda en last_message directamente
    let msgQuery = supabase
      .from("conversations")
      .select("*, contacts(id, first_name, last_name, phone, email, company, status, created_at)")
      .eq("status", "open")
      .order("last_activity", { ascending: false })
      .range(from, to)

    if (search) {
      msgQuery = msgQuery.ilike("last_message", `%${search}%`)
    }

    // Búsqueda por nombre de contacto (query separada)
    let contactIds: string[] = []
    if (search) {
      const { data: matchedContacts } = await supabase
        .from("contacts")
        .select("id")
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      contactIds = (matchedContacts ?? []).map((c: { id: string }) => c.id)
    }

    // Si hay búsqueda, también traer convs que coincidan por contact_id
    let extraConvs: DbConversation[] = []
    if (search && contactIds.length > 0) {
      const { data } = await supabase
        .from("conversations")
        .select("*, contacts(id, first_name, last_name, phone, email, company, status, created_at)")
        .eq("status", "open")
        .in("contact_id", contactIds)
        .order("last_activity", { ascending: false })
        .range(0, PAGE_SIZE - 1)
      extraConvs = (data ?? []) as DbConversation[]
    }

    const { data: msgData, error: msgError } = await msgQuery

    if (msgError) {
      setError(msgError.message)
      if (replace) setLoading(false)
      else setLoadingMore(false)
      return
    }

    // Unir y deduplicar por id
    const seenIds = new Set<string>()
    const rawRows: typeof msgData = []
    for (const row of [...(msgData ?? []), ...extraConvs]) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id)
        rawRows.push(row)
      }
    }

    // Ordenar por last_activity desc después de unir
    rawRows.sort((a, b) =>
      new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    )

    const newConvs: Conversation[]  = []
    const newContacts: MockContact[] = []
    const seenContacts = new Set<string>()

    for (const row of rawRows) {
      newConvs.push(mapConversation(row as DbConversation))
      if (row.wa_contact_id) waMapRef.current[row.id] = row.wa_contact_id
      if (row.contacts && !seenContacts.has(row.contact_id)) {
        newContacts.push(mapContact(row.contacts as DbContact))
        seenContacts.add(row.contact_id)
      }
    }

    // Determinar si hay más páginas (solo aplica sin búsqueda o con búsqueda en last_message)
    const returnedCount = (msgData ?? []).length
    setHasMore(!search && returnedCount === PAGE_SIZE)

    if (replace) {
      setConversations(newConvs)
      setContacts(newContacts)
      setLoading(false)
    } else {
      setConversations((prev) => {
        const existingIds = new Set(prev.map((c) => c.id))
        const fresh = newConvs.filter((c) => !existingIds.has(c.id))
        return [...prev, ...fresh]
      })
      setContacts((prev) => {
        const existingIds = new Set(prev.map((c) => c.id))
        const fresh = newContacts.filter((c) => !existingIds.has(c.id))
        return [...prev, ...fresh]
      })
      setLoadingMore(false)
    }
  }, [])

  // ── Carga inicial ─────────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    pageRef.current   = 0
    searchRef.current = ""
    setLoading(true)
    setHasMore(true)
    await loadPage("", 0, true)
  }, [loadPage])

  // ── Buscar (resetea paginación) ───────────────────────────────────────────
  const searchConversations = useCallback(async (search: string) => {
    pageRef.current   = 0
    searchRef.current = search
    setLoading(true)
    setHasMore(true)
    await loadPage(search, 0, true)
  }, [loadPage])

  // ── Cargar siguiente página ───────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = pageRef.current + 1
    pageRef.current = nextPage
    await loadPage(searchRef.current, nextPage, false)
  }, [loadPage, loadingMore, hasMore])

  // ── Cargar mensajes de una conversación ───────────────────────────────────
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("[inbox] Error cargando mensajes:", error.message)
      return
    }

    setMessages((prev) => {
      const otherConvMsgs = prev.filter((m) => m.conversationId !== conversationId)
      return [...otherConvMsgs, ...(data ?? []).map(mapMessage)]
    })
  }, [])

  // ── Marcar conversación como leída ────────────────────────────────────────
  const markAsRead = useCallback(async (conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    )
    await supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
  }, [])

  // ── Enviar mensaje de agente ──────────────────────────────────────────────
  const sendMessage = useCallback(async (
    conversationId: string,
    text: string,
    isInternal: boolean,
    agentName: string,
  ) => {
    const optimisticId = `opt-${Date.now()}`
    const now = new Date().toISOString()

    const optimistic: Message = {
      id:             optimisticId,
      conversationId,
      sender:         "agent",
      type:           "text",
      text,
      isInternal,
      timestamp:      now,
    }
    setMessages((prev) => [...prev, optimistic])

    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direction:       "outbound",
        sender_type:     "agent",
        sender_name:     agentName,
        content_type:    "text",
        content:         text,
        is_internal:     isInternal,
        status:          "sent",
      })
      .select()
      .single()

    if (error) {
      console.error("[inbox] Error guardando mensaje:", error.message)
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      return false
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === optimisticId ? mapMessage(data as DbMessage) : m))
    )

    await supabase
      .from("conversations")
      .update({ last_message: text, last_activity: now })
      .eq("id", conversationId)

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: text, lastActivityAt: now } : c
      )
    )

    if (!isInternal) {
      const waId = waMapRef.current[conversationId]
      if (waId) {
        const phone = waId.startsWith("+") ? waId : `+${waId}`
        try {
          const res = await fetch("/API/send-text-whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, text }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            console.error("[inbox] Error enviando WhatsApp:", err)
          }
        } catch (e) {
          console.error("[inbox] Error de red al enviar WhatsApp:", e)
        }
      } else {
        console.warn("[inbox] No hay wa_contact_id para conversación:", conversationId)
      }
    }

    return true
  }, [])

  // ── Actualizar conversación (etapa, agente, modo) ─────────────────────────
  const updateConversation = useCallback(async (
    conversationId: string,
    updates: Partial<{ pipeline_stage: string; assigned_agent: string | null; mode: string }>
  ) => {
    const { error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)

    if (error) {
      console.error("[inbox] Error actualizando conversación:", error.message)
      return
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c
        return {
          ...c,
          ...(updates.pipeline_stage && { pipelineStage: updates.pipeline_stage as Conversation["pipelineStage"] }),
          ...(updates.assigned_agent !== undefined && { assignedAgentId: updates.assigned_agent }),
          ...(updates.mode && { botStatus: updates.mode === "bot" ? "bot" : "human" }),
        }
      })
    )
  }, [])

  // ── Realtime: nuevos mensajes y conversaciones ────────────────────────────
  useEffect(() => {
    loadConversations()

    const msgChannel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = mapMessage(payload.new as DbMessage)
          setMessages((prev) => {
            if (prev.find((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== newMsg.conversationId) return c
              const isActive = activeConvIdRef.current === c.id
              return {
                ...c,
                lastMessage:    newMsg.text ?? c.lastMessage,
                lastActivityAt: newMsg.timestamp,
                unreadCount:    isActive ? 0 : c.unreadCount + 1,
              }
            })
          )
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        () => { loadConversations() }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const updated = mapConversation(payload.new as DbConversation)
          setConversations((prev) =>
            prev.map((c) => (c.id === updated.id ? { ...updated, tags: c.tags } : c))
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(msgChannel) }
  }, [loadConversations])

  return {
    conversations,
    contacts,
    messages,
    loading,
    loadingMore,
    hasMore,
    error,
    activeConvIdRef,
    loadMessages,
    markAsRead,
    sendMessage,
    updateConversation,
    searchConversations,
    loadMore,
    setConversations,
  }
}

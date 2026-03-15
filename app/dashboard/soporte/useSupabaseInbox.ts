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
  name: string
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
  return {
    id:             db.id,
    conversationId: db.conversation_id,
    sender:         senderMap[db.sender_type] ?? "bot",
    type:           (db.content_type as Message["type"]) ?? "text",
    text:           db.content ?? undefined,
    isInternal:     db.is_internal,
    timestamp:      db.created_at,
  }
}

function mapContact(db: DbContact): MockContact {
  return {
    id:                 db.id,
    name:               db.name,
    phone:              db.phone ?? undefined,
    channels:           ["whatsapp"],
    createdAt:          db.created_at,
    totalConversations: 1,
  }
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useSupabaseInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [contacts, setContacts]           = useState<MockContact[]>([])
  const [messages, setMessages]           = useState<Message[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const activeConvIdRef                   = useRef<string | null>(null)
  const waMapRef                          = useRef<Record<string, string>>({})

  // ── Cargar conversaciones + contactos ─────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("*, contacts(id, name, phone, email, company, status, created_at)")
      .eq("status", "open")
      .order("last_activity", { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    const convs: Conversation[]   = []
    const ctcts: MockContact[]    = []
    const seen = new Set<string>()

    for (const row of data ?? []) {
      convs.push(mapConversation(row as DbConversation))
      // Guardar wa_contact_id para envíos salientes
      if (row.wa_contact_id) {
        waMapRef.current[row.id] = row.wa_contact_id
      }
      if (row.contacts && !seen.has(row.contact_id)) {
        ctcts.push(mapContact(row.contacts as DbContact))
        seen.add(row.contact_id)
      }
    }

    setConversations(convs)
    setContacts(ctcts)
    setLoading(false)
  }, [])

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

    // Optimistic UI
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

    // Guardar en Supabase
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

    // Reemplazar optimistic con el real
    setMessages((prev) =>
      prev.map((m) => (m.id === optimisticId ? mapMessage(data as DbMessage) : m))
    )

    // Actualizar last_message en conversación
    await supabase
      .from("conversations")
      .update({ last_message: text, last_activity: now })
      .eq("id", conversationId)

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: text, lastActivityAt: now } : c
      )
    )

    // Enviar por WhatsApp si no es nota interna
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
          // Actualizar conversación en la lista
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
    error,
    activeConvIdRef,
    loadMessages,
    markAsRead,
    sendMessage,
    updateConversation,
    setConversations,
  }
}

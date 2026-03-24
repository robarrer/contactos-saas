import { useEffect, useState } from "react"
import { supabase } from "@/app/lib/supabase"
import type { Agent } from "./mockData"

const MEMBER_COLORS = [
  "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626",
  "#6366f1", "#0d9488", "#b45309", "#9333ea", "#0369a1",
]

function memberColor(id: string): string {
  let n = 0
  for (const c of id) n += c.charCodeAt(0)
  return MEMBER_COLORS[n % MEMBER_COLORS.length]
}

function memberInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function useOrgMembers() {
  const [orgMembers, setOrgMembers] = useState<Agent[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [{ data: { user } }, res] = await Promise.all([
        supabase.auth.getUser(),
        fetch("/API/admin/users"),
      ])

      if (cancelled) return

      if (user) setCurrentUserId(user.id)

      if (res.ok) {
        const json = await res.json()
        const members: Agent[] = (json.users ?? []).map(
          (u: { id: string; full_name: string; email: string }) => ({
            id:       u.id,
            name:     u.full_name || u.email || "Sin nombre",
            initials: memberInitials(u.full_name || "?"),
            color:    memberColor(u.id),
          })
        )
        setOrgMembers(members)
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { orgMembers, currentUserId, loading }
}

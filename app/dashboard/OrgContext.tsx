"use client"

/**
 * OrgContext — resuelve el organization_id del usuario UNA sola vez al montar el layout
 * del dashboard y lo comparte con todas las páginas hijas mediante contexto.
 *
 * Antes de este cambio, cada página hacía independientemente:
 *   auth.getUser() → query "profiles"   (2 round-trips secuenciales)
 * Con este provider esos 2 round-trips ocurren una sola vez para toda la sesión,
 * y las páginas hijas reciben el orgId al instante desde el contexto.
 */

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/app/lib/supabase"

const OrgContext = createContext<string | null>(null)

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.organization_id) setOrgId(data.organization_id)
        })
    })
  }, [])

  return <OrgContext.Provider value={orgId}>{children}</OrgContext.Provider>
}

/** Hook para consumir el orgId desde cualquier componente hijo del dashboard. */
export function useOrgId() {
  return useContext(OrgContext)
}

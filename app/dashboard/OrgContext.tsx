"use client"

/**
 * OrgContext — resuelve el organization_id y el nombre de la organización del usuario
 * UNA sola vez al montar el layout del dashboard y los comparte con todas las páginas
 * hijas mediante contexto.
 *
 * Antes de este cambio, cada página hacía independientemente:
 *   auth.getUser() → query "profiles"   (2 round-trips secuenciales)
 * Con este provider esos 2 round-trips ocurren una sola vez para toda la sesión,
 * y las páginas hijas reciben el orgId al instante desde el contexto.
 */

import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/app/lib/supabase"

interface OrgContextValue {
  orgId: string | null
  orgName: string | null
}

const OrgContext = createContext<OrgContextValue>({ orgId: null, orgName: null })

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId]     = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle()
        .then(async ({ data }) => {
          if (!data?.organization_id) return
          setOrgId(data.organization_id)
          const { data: org } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", data.organization_id)
            .maybeSingle()
          if (org?.name) setOrgName(org.name)
        })
    })
  }, [])

  return (
    <OrgContext.Provider value={{ orgId, orgName }}>
      {children}
    </OrgContext.Provider>
  )
}

/** Hook para consumir el orgId desde cualquier componente hijo del dashboard. */
export function useOrgId() {
  return useContext(OrgContext).orgId
}

/** Hook para consumir el nombre de la organización desde cualquier componente hijo del dashboard. */
export function useOrgName() {
  return useContext(OrgContext).orgName
}

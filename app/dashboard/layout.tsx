"use client"

import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { createClient } from "@/app/lib/supabase"
import { OrgProvider } from "./OrgContext"

const ICO = "#38bdf8"   // celeste
const S   = 18          // tamaño base

function IconDashboard() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

function IconContacts() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="4"/><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7"/>
      <circle cx="19" cy="9" r="2.5"/><path d="M22 21c0-2.5-1.5-4.5-3-5"/>
    </svg>
  )
}

function IconEmbudo() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h18v2l-7 7v7l-4-2v-5L3 6V4z"/>
    </svg>
  )
}

function IconAgentes() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <path d="M9 11V7a3 3 0 0 1 6 0v4"/>
      <circle cx="9" cy="16" r="1" fill={ICO}/><circle cx="15" cy="16" r="1" fill={ICO}/>
      <path d="M12 3v2M7 5l1 1.5M17 5l-1 1.5"/>
    </svg>
  )
}

function IconChat() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function IconPlantillas() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/>
    </svg>
  )
}

function IconRespuestas() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function IconAjustes() {
  return (
    <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke={ICO} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

const NAV_ITEMS = [
  { href: "/dashboard",            label: "Dashboard",  Icon: IconDashboard  },
  { href: "/dashboard/contacts",   label: "Contactos",  Icon: IconContacts   },
  { href: "/dashboard/embudo",     label: "Embudo",     Icon: IconEmbudo     },
  { href: "/dashboard/agentes",    label: "Agentes",    Icon: IconAgentes    },
  { href: "/dashboard/soporte",    label: "Chat",       Icon: IconChat       },
  { href: "/dashboard/plantillas", label: "Plantillas", Icon: IconPlantillas },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname  = usePathname()
  const router    = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const isFullscreen =
    pathname === "/dashboard/soporte"    ||
    pathname === "/dashboard/embudo"     ||
    pathname === "/dashboard/contacts"   ||
    pathname === "/dashboard/agentes"    ||
    pathname === "/dashboard/plantillas" ||
    pathname === "/dashboard/ajustes"

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard"
    return pathname.startsWith(href)
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside
        style={{
          width: collapsed ? "64px" : "228px",
          background: "#0f172a",
          color: "white",
          padding: collapsed ? "16px 10px" : "20px 16px",
          transition: "width 180ms ease",
          flexShrink: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Logo + collapse button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            marginBottom: 24,
          }}
        >
          {!collapsed && (
            <img src="/logo-barra.png" alt="Kueri" style={{ height: 28, width: "auto" }} />
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir" : "Colapsar"}
            title={collapsed ? "Expandir" : "Colapsar"}
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              {collapsed
                ? <><path d="M9 18l6-6-6-6"/></>
                : <><path d="M15 18l-6-6 6-6"/></>
              }
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <a
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                  padding: collapsed ? "9px 0" : "9px 10px",
                  borderRadius: 10,
                  justifyContent: collapsed ? "center" : "flex-start",
                  background: active ? "rgba(56,189,248,0.12)" : "transparent",
                  color: active ? "#38bdf8" : "rgba(255,255,255,0.65)",
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  transition: "background 120ms, color 120ms",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <Icon />
                </span>
                {!collapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
              </a>
            )
          })}

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />

          {/* Ajustes */}
          {(() => {
            const active = isActive("/dashboard/ajustes")
            return (
              <a
                href="/dashboard/ajustes"
                title={collapsed ? "Ajustes" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textDecoration: "none",
                  padding: collapsed ? "9px 0" : "9px 10px",
                  borderRadius: 10,
                  justifyContent: collapsed ? "center" : "flex-start",
                  background: active ? "rgba(56,189,248,0.12)" : "transparent",
                  color: active ? "#38bdf8" : "rgba(255,255,255,0.65)",
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                  transition: "background 120ms, color 120ms",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <IconAjustes />
                </span>
                {!collapsed && <span>Ajustes</span>}
              </a>
            )
          })()}
          {/* Botón cerrar sesión — al fondo del sidebar */}
          <div style={{ marginTop: "auto", paddingTop: 12 }}>
            <button
              onClick={handleLogout}
              title={collapsed ? "Cerrar sesión" : undefined}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                justifyContent: collapsed ? "center" : "flex-start",
                padding: collapsed ? "9px 0" : "9px 10px",
                borderRadius: 10,
                background: "transparent",
                border: "none",
                color: "rgba(255,255,255,0.45)",
                fontSize: 14,
                cursor: "pointer",
                transition: "background 120ms, color 120ms",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.12)"
                ;(e.currentTarget as HTMLButtonElement).style.color = "#f87171"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent"
                ;(e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"
              }}
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                <svg width={S} height={S} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </span>
              {!collapsed && <span>Cerrar sesión</span>}
            </button>
          </div>
        </nav>
      </aside>

      <main
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          overflow: isFullscreen ? "hidden" : "auto",
          padding: isFullscreen ? 0 : "32px",
          background: "#f9fafb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* OrgProvider resuelve el organization_id una sola vez para todas las páginas */}
        <OrgProvider>{children}</OrgProvider>
      </main>
    </div>
  )
}

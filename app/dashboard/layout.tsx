"use client"

import { usePathname } from "next/navigation"
import { useState } from "react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const isFullscreen = pathname === "/dashboard/soporte" || pathname === "/dashboard/embudo"

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside
        style={{
          width: collapsed ? "72px" : "240px",
          background: "#111827",
          color: "white",
          padding: collapsed ? "16px 12px" : "24px",
          transition: "width 180ms ease",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            gap: 12,
          }}
        >
          {!collapsed && (
            <img
              src="/logo-kueri.png"
              alt="Kueri"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          )}

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir" : "Colapsar"}
            style={{
              background: "rgba(255,255,255,0.06)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: "8px 10px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav style={{ marginTop: "24px", display: "grid", gap: 8 }}>
          <a
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "white",
              textDecoration: "none",
              padding: "10px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
            title={collapsed ? "Dashboard" : undefined}
          >
            <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>
              ⌂
            </span>
            {!collapsed && <span>Dashboard</span>}
          </a>

          <a
            href="/dashboard/contacts"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "white",
              textDecoration: "none",
              padding: "10px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
            title={collapsed ? "Contactos" : undefined}
          >
            <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>
              👥
            </span>
            {!collapsed && <span>Contactos</span>}
          </a>

          <a
            href="/dashboard/embudo"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "white",
              textDecoration: "none",
              padding: "10px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
            title={collapsed ? "Embudo" : undefined}
          >
            <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>
              🗂
            </span>
            {!collapsed && <span>Embudo</span>}
          </a>

          <a
            href="/dashboard/soporte"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "white",
              textDecoration: "none",
              padding: "10px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
            title={collapsed ? "Soporte" : undefined}
          >
            <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>
              💬
            </span>
            {!collapsed && <span>Soporte</span>}
          </a>

          <a
            href="/dashboard/plantillas"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "white",
              textDecoration: "none",
              padding: "10px 10px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
            }}
            title={collapsed ? "Plantillas" : undefined}
          >
            <span aria-hidden="true" style={{ width: 18, textAlign: "center" }}>
              🧩
            </span>
            {!collapsed && <span>Plantillas</span>}
          </a>
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
        {children}
      </main>
    </div>
  )
}
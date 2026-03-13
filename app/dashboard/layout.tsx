"use client"

import { useState } from "react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: collapsed ? "72px" : "240px",
          background: "#111827",
          color: "white",
          padding: collapsed ? "16px 12px" : "24px",
          transition: "width 180ms ease",
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

      <main style={{ flex: 1, padding: "32px", background: "#f9fafb" }}>
        {children}
      </main>
    </div>
  )
}
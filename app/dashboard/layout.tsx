export default function DashboardLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <aside
          style={{
            width: "240px",
            background: "#111827",
            color: "white",
            padding: "24px",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Mi SaaS</h2>
  
          <nav style={{ marginTop: "24px" }}>
            <a
              href="/dashboard"
              style={{
                display: "block",
                color: "white",
                textDecoration: "none",
                marginBottom: "12px",
              }}
            >
              Dashboard
            </a>
  
            <a
              href="/dashboard/contacts"
              style={{
                display: "block",
                color: "white",
                textDecoration: "none",
                marginBottom: "12px",
              }}
            >
              Contactos
            </a>
          </nav>
        </aside>
  
        <main style={{ flex: 1, padding: "32px", background: "#f9fafb" }}>
          {children}
        </main>
      </div>
    )
  }
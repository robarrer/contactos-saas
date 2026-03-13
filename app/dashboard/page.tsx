export default function DashboardPage() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
        }}
      >
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <span style={{ color: "#6b7280" }}>Indicadores de ejemplo (dummy)</span>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard label="Contactos totales" value="1,248" trend="+12% vs. mes pasado" />
        <StatCard
          label="Nuevos contactos (7 días)"
          value="87"
          trend="+8 esta semana"
        />
        <StatCard label="Tasa de respuesta" value="34%" trend="+3 pts." />
        <StatCard label="Plantillas activas" value="9" trend="Sin cambios" />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.2fr)",
          gap: 16,
        }}
      >
        <ChartCard title="Contactos creados por día (dummy)">
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 160,
            }}
          >
            {[40, 72, 56, 90, 110, 80, 65].map((h, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background:
                    "linear-gradient(180deg, #60a5fa 0%, rgba(96,165,250,0.2) 100%)",
                  borderRadius: 8,
                  height: `${h}%`,
                }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
              fontSize: 12,
              color: "#6b7280",
            }}
          >
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Distribución por estado (dummy)">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                background:
                  "conic-gradient(#22c55e 0 40%, #3b82f6 40% 75%, #eab308 75% 100%)",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 18,
                  borderRadius: "50%",
                  background: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  color: "#111827",
                }}
              >
                100%
              </div>
            </div>
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              fontSize: 13,
              color: "#4b5563",
            }}
          >
            <li style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#22c55e",
                }}
              />
              Leads · 40%
            </li>
            <li
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#3b82f6",
                }}
              />
              Clientes · 35%
            </li>
            <li
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: "#eab308",
                }}
              />
              Prospectos · 25%
            </li>
          </ul>
        </ChartCard>
      </section>
    </div>
  )
}

type StatCardProps = {
  label: string
  value: string
  trend: string
}

function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: 16,
      }}
    >
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#16a34a" }}>{trend}</div>
    </div>
  )
}

type ChartCardProps = {
  title: string
  children: React.ReactNode
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        padding: 16,
      }}
    >
      <h2
        style={{
          marginTop: 0,
          marginBottom: 12,
          fontSize: 16,
          fontWeight: 500,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}
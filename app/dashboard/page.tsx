"use client"

import { useEffect, useState } from "react"

// ── Tipos ──────────────────────────────────────────────────────────────────
type DayData     = { date: string; convs: number; inbound: number; outbound: number }
type ChannelData = { channel: string; count: number }
type SenderData  = { type: string; count: number }

type Metrics = {
  period: number
  kpis: {
    convsToday:         number
    convsPeriod:        number
    closedConvsPeriod:  number
    msgsPeriod:         number
    contactsPeriod:     number
    openConvs:          number
    botConvs:           number
    agentConvs:         number
    msgsPerConv:        number
  }
  charts: {
    byDay:     DayData[]
    byChannel: ChannelData[]
    bySender:  SenderData[]
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString("es-CL") }
function pct(val: number, total: number) {
  if (!total) return 0
  return Math.round((val / total) * 100)
}
function fmtDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  if (days <= 7) return d.toLocaleDateString("es", { weekday: "short" })
  return d.toLocaleDateString("es", { day: "numeric", month: "short" })
}

const PERIOD_OPTIONS = [
  { value: 7,  label: "7 días" },
  { value: 30, label: "30 días" },
  { value: 90, label: "90 días" },
]

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp:  "WhatsApp",
  instagram: "Instagram",
  facebook:  "Facebook",
  webchat:   "Web Chat",
  sms:       "SMS",
}
const CHANNEL_COLORS: Record<string, string> = {
  whatsapp:  "#25D366",
  instagram: "#E1306C",
  facebook:  "#1877F2",
  webchat:   "#6366f1",
  sms:       "#f59e0b",
}
const SENDER_COLORS = ["#14b8a6", "#a855f7", "#22c55e"]

// ── Componentes reutilizables ──────────────────────────────────────────────

function KpiCard({
  label, value, sub, subColor = "#6b7280", icon,
}: {
  label: string
  value: string | number
  sub?: string
  subColor?: string
  icon?: React.ReactNode
}) {
  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: "16px 20px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1.4 }}>
          {label}
        </div>
        {icon && <div style={{ color: "#d1d5db", flexShrink: 0, marginTop: 1 }}>{icon}</div>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", lineHeight: 1 }}>
        {typeof value === "number" ? fmt(value) : value}
      </div>
      {sub && <div style={{ fontSize: 12, color: subColor, marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, children, style }: {
  title: string; children: React.ReactNode; style?: React.CSSProperties
}) {
  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: "20px 20px 16px", ...style }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}

function LegendItem({ color, label, value, total }: {
  color: string; label: string; value: number; total: number
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#4b5563", marginTop: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{fmt(value)}</span>
      <span style={{ color: "#9ca3af", fontSize: 11, width: 36, textAlign: "right" }}>{pct(value, total)}%</span>
    </div>
  )
}

// Gráfica de barras simples (o apiladas con secondKey)
function BarChart({
  data, valueKey, color, height = 150, secondKey, secondColor,
  labelKey = "date", days,
}: {
  data: Record<string, unknown>[]
  valueKey: string
  color: string
  height?: number
  secondKey?: string
  secondColor?: string
  labelKey?: string
  days: number
}) {
  if (!data.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 13 }}>
        Sin datos en el período
      </div>
    )
  }

  const maxVal = Math.max(
    ...data.map(d => (d[valueKey] as number || 0) + (secondKey ? (d[secondKey] as number || 0) : 0)),
    1
  )

  // Cuántas etiquetas mostrar en el eje X
  const maxLabels = 7
  const step = Math.max(1, Math.ceil(data.length / maxLabels))

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: days >= 30 ? 1 : 4, height }}>
        {data.map((d, i) => {
          const v1    = d[valueKey]  as number || 0
          const v2    = secondKey ? (d[secondKey] as number || 0) : 0
          const total = v1 + v2
          const barH  = (total / maxVal) * 100

          return (
            <div
              key={i}
              title={secondKey ? `↙ ${v1}  ↗ ${v2}` : String(v1)}
              style={{
                flex: 1, minWidth: 3,
                height: `${barH}%`,
                display: "flex", flexDirection: "column-reverse",
                borderRadius: "2px 2px 0 0", overflow: "hidden",
              }}
            >
              <div style={{ flex: v1 || (total === 0 ? 1 : 0), background: color }} />
              {secondKey && <div style={{ flex: v2, background: secondColor }} />}
            </div>
          )
        })}
      </div>

      {/* Eje X */}
      <div style={{ display: "flex", marginTop: 6, fontSize: 10, color: "#9ca3af" }}>
        {data.map((d, i) => {
          const show = i === 0 || i === data.length - 1 || i % step === 0
          return (
            <span
              key={i}
              style={{
                flex: 1, textAlign: "center",
                visibility: show ? "visible" : "hidden",
                overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {fmtDate(d[labelKey] as string, days)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// Donut chart con CSS conic-gradient
function DonutChart({ segments, total, center }: {
  segments: { value: number; color: string }[]
  total: number
  center?: string
}) {
  if (!total) {
    return (
      <div style={{
        width: 120, height: 120, borderRadius: "50%",
        background: "#f3f4f6", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, color: "#d1d5db",
      }}>
        Sin datos
      </div>
    )
  }

  let acc = 0
  const parts = segments.map(s => {
    const deg = (s.value / total) * 360
    const from = acc; acc += deg
    return `${s.color} ${from.toFixed(1)}deg ${acc.toFixed(1)}deg`
  })

  return (
    <div style={{
      width: 120, height: 120, borderRadius: "50%", flexShrink: 0,
      background: `conic-gradient(${parts.join(", ")})`,
      position: "relative",
    }}>
      <div style={{
        position: "absolute", inset: 22, borderRadius: "50%", background: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color: "#111827",
      }}>
        {center ?? fmt(total)}
      </div>
    </div>
  )
}

// ── Íconos inline SVG ──────────────────────────────────────────────────────
const IcoChat     = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
const IcoMsg      = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 2L11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/></svg>
const IcoContact  = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M2 21c0-4 3.1-7 7-7s7 3 7 7"/><path d="M19 8v6M22 11h-6"/></svg>
const IcoOpen     = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IcoBot      = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/><circle cx="9" cy="16" r="1" fill="currentColor"/><circle cx="15" cy="16" r="1" fill="currentColor"/></svg>
const IcoAgent    = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
const IcoTrend    = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
const IcoCheck    = () => <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="20 6 9 17 4 12"/></svg>

// ── Skeleton de carga ──────────────────────────────────────────────────────
function Skeleton({ h = 80 }: { h?: number }) {
  return (
    <div style={{
      background: "linear-gradient(90deg, #f3f4f6 25%, #e9eaec 50%, #f3f4f6 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
      borderRadius: 8, height: h,
    }} />
  )
}

// ── Página principal ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const [period, setPeriod] = useState(30)
  const [data, setData]     = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/API/metrics?days=${period}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [period])

  const kpis   = data?.kpis
  const charts = data?.charts
  const pLabel = PERIOD_OPTIONS.find(o => o.value === period)?.label ?? `${period} días`

  const botAgentTotal  = (kpis?.botConvs ?? 0) + (kpis?.agentConvs ?? 0)
  const escalationRate = pct(kpis?.agentConvs ?? 0, botAgentTotal)

  const channelTotal = charts?.byChannel.reduce((s, c) => s + c.count, 0) ?? 0
  const senderTotal  = charts?.bySender.reduce((s, c) => s + c.count, 0) ?? 0

  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
      `}</style>

      <div style={{ maxWidth: 1400, width: "100%" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Indicadores</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af" }}>
              Métricas de tu organización · {loading ? "cargando…" : `últimos ${pLabel}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 4, background: "white", border: "1px solid #e5e7eb", borderRadius: 10, padding: 4 }}>
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                style={{
                  padding: "6px 14px", borderRadius: 7, border: "none",
                  fontSize: 13, fontWeight: period === opt.value ? 600 : 400,
                  background: period === opt.value ? "#0f172a" : "transparent",
                  color: period === opt.value ? "white" : "#6b7280",
                  cursor: "pointer", transition: "all 120ms",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", color: "#dc2626", marginBottom: 16, fontSize: 13 }}>
            Error al cargar métricas: {error}
          </div>
        )}

        {/* ── KPIs fila 1 ── */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 12 }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: "16px 20px" }}>
                <Skeleton h={60} />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                label={`Conversaciones · ${pLabel}`}
                value={kpis?.convsPeriod ?? 0}
                sub={`${kpis?.convsToday ?? 0} iniciadas hoy`}
                subColor="#3b82f6"
                icon={<IcoChat />}
              />
              <KpiCard
                label={`Mensajes totales · ${pLabel}`}
                value={kpis?.msgsPeriod ?? 0}
                sub={`${kpis?.msgsPerConv ?? 0} por conversación`}
                icon={<IcoMsg />}
              />
              <KpiCard
                label={`Contactos nuevos · ${pLabel}`}
                value={kpis?.contactsPeriod ?? 0}
                icon={<IcoContact />}
              />
              <KpiCard
                label="Conversaciones abiertas"
                value={kpis?.openConvs ?? 0}
                sub="En este momento"
                subColor="#f59e0b"
                icon={<IcoOpen />}
              />
            </>
          )}
        </section>

        {/* ── KPIs fila 2 ── */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 20 }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: "16px 20px" }}>
                <Skeleton h={60} />
              </div>
            ))
          ) : (
            <>
              <KpiCard
                label={`Gestionadas por bot · ${pLabel}`}
                value={kpis?.botConvs ?? 0}
                sub={`${pct(kpis?.botConvs ?? 0, kpis?.convsPeriod ?? 0)}% del total`}
                subColor="#a855f7"
                icon={<IcoBot />}
              />
              <KpiCard
                label={`Escaladas a agente · ${pLabel}`}
                value={kpis?.agentConvs ?? 0}
                sub={`${pct(kpis?.agentConvs ?? 0, kpis?.convsPeriod ?? 0)}% del total`}
                subColor="#22c55e"
                icon={<IcoAgent />}
              />
              <KpiCard
                label={`Tasa de escalación · ${pLabel}`}
                value={`${escalationRate}%`}
                sub="Agente / (Bot + Agente)"
                icon={<IcoTrend />}
              />
              <KpiCard
                label={`Conversaciones cerradas · ${pLabel}`}
                value={kpis?.closedConvsPeriod ?? 0}
                sub={`${pct(kpis?.closedConvsPeriod ?? 0, kpis?.convsPeriod ?? 0)}% del período`}
                subColor="#16a34a"
                icon={<IcoCheck />}
              />
            </>
          )}
        </section>

        {/* ── Gráficas fila 1 ── */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 12 }}>
          <ChartCard title={`Conversaciones nuevas por día · ${pLabel}`}>
            {loading
              ? <Skeleton h={180} />
              : <BarChart
                  data={charts?.byDay ?? []}
                  valueKey="convs"
                  color="#38bdf8"
                  height={160}
                  days={period}
                />
            }
          </ChartCard>

          <ChartCard title={`Distribución por canal · ${pLabel}`}>
            {loading ? <Skeleton h={180} /> : (
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutChart
                  segments={(charts?.byChannel ?? []).map(c => ({
                    value: c.count,
                    color: CHANNEL_COLORS[c.channel] ?? "#9ca3af",
                  }))}
                  total={channelTotal}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(charts?.byChannel ?? []).map(c => (
                    <LegendItem
                      key={c.channel}
                      color={CHANNEL_COLORS[c.channel] ?? "#9ca3af"}
                      label={CHANNEL_LABELS[c.channel] ?? c.channel}
                      value={c.count}
                      total={channelTotal}
                    />
                  ))}
                  {!channelTotal && (
                    <p style={{ fontSize: 13, color: "#d1d5db", margin: 0 }}>Sin datos en el período</p>
                  )}
                </div>
              </div>
            )}
          </ChartCard>
        </section>

        {/* ── Gráficas fila 2 ── */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 12, marginBottom: 12 }}>
          <ChartCard title={`Mensajes por día · ${pLabel} · Entrantes vs. Salientes`}>
            {loading ? <Skeleton h={180} /> : (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#14b8a6", flexShrink: 0 }} />
                    Entrantes (contacto)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1", flexShrink: 0 }} />
                    Salientes (bot + agente)
                  </div>
                </div>
                <BarChart
                  data={charts?.byDay ?? []}
                  valueKey="inbound"
                  color="#14b8a6"
                  secondKey="outbound"
                  secondColor="#6366f1"
                  height={150}
                  days={period}
                />
              </>
            )}
          </ChartCard>

          <ChartCard title={`Mensajes por remitente · ${pLabel}`}>
            {loading ? <Skeleton h={180} /> : (
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutChart
                  segments={(charts?.bySender ?? []).map((s, i) => ({
                    value: s.count,
                    color: SENDER_COLORS[i] ?? "#9ca3af",
                  }))}
                  total={senderTotal}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {(charts?.bySender ?? []).map((s, i) => (
                    <LegendItem
                      key={s.type}
                      color={SENDER_COLORS[i] ?? "#9ca3af"}
                      label={s.type}
                      value={s.count}
                      total={senderTotal}
                    />
                  ))}
                  {!senderTotal && (
                    <p style={{ fontSize: 13, color: "#d1d5db", margin: 0 }}>Sin datos en el período</p>
                  )}
                </div>
              </div>
            )}
          </ChartCard>
        </section>

        {/* ── Gráfica fila 3: Bot vs Agente ── */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 8 }}>
          <ChartCard title={`Distribución Bot vs. Agente por día · ${pLabel}`}>
            {loading ? <Skeleton h={140} /> : (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#38bdf8", flexShrink: 0 }} />
                    Conversaciones nuevas (cualquier modo)
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    Bot total: <strong style={{ color: "#a855f7" }}>{fmt(kpis?.botConvs ?? 0)}</strong>
                    &nbsp;·&nbsp;
                    Agente total: <strong style={{ color: "#22c55e" }}>{fmt(kpis?.agentConvs ?? 0)}</strong>
                    &nbsp;·&nbsp;
                    Sin modo: <strong style={{ color: "#6b7280" }}>{fmt((kpis?.convsPeriod ?? 0) - botAgentTotal)}</strong>
                  </div>
                </div>
                <BarChart
                  data={charts?.byDay ?? []}
                  valueKey="convs"
                  color="#38bdf8"
                  height={120}
                  days={period}
                />
              </>
            )}
          </ChartCard>
        </section>

      </div>
    </>
  )
}

"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/app/lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingKey = "message_debounce_seconds"

type Settings = {
  message_debounce_seconds: number
}

const DEFAULTS: Settings = {
  message_debounce_seconds: 5,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function debounceLabel(s: number): string {
  if (s === 0) return "Sin pausa (respuesta inmediata)"
  if (s === 1) return "1 segundo"
  if (s < 60) return `${s} segundos`
  return "60 segundos"
}

function debounceColor(s: number): string {
  if (s === 0) return "#2563eb"
  if (s <= 5) return "#16a34a"
  if (s <= 15) return "#ca8a04"
  return "#dc2626"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AjustesPage() {
  const [settings, setSettings]   = useState<Settings>(DEFAULTS)
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState<SettingKey | null>(null)
  const [saved, setSaved]         = useState<SettingKey | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("settings")
        .select("key, value")
      if (data) {
        const map: Partial<Settings> = {}
        for (const row of data) {
          if (row.key === "message_debounce_seconds") {
            map.message_debounce_seconds = parseInt(row.value, 10)
          }
        }
        setSettings({ ...DEFAULTS, ...map })
      }
      setLoading(false)
    }
    load()
  }, [])

  async function saveSetting(key: SettingKey, value: number) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaving(key)
    await supabase
      .from("settings")
      .upsert({ key, value: String(value) }, { onConflict: "key" })
    setSaving(null)
    setSaved(key)
    saveTimerRef.current = setTimeout(() => setSaved(null), 2000)
  }

  function handleDebounceChange(value: number) {
    setSettings((prev) => ({ ...prev, message_debounce_seconds: value }))
  }

  function handleDebounceCommit(value: number) {
    saveSetting("message_debounce_seconds", value)
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#111827" }}>Ajustes</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Configuración general de la plataforma</p>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#9ca3af", fontSize: 14 }}>
          Cargando ajustes…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── Sección: Comportamiento del bot ── */}
          <Section title="Comportamiento del bot" icon="🤖">

            <SettingRow
              title="Tiempo de pausa para agrupar mensajes"
              description="Cuando un usuario envía varios mensajes seguidos (ej: presiona Enter entre frases), el bot espera este tiempo antes de responder. Esto agrupa los mensajes en una sola respuesta y evita respuestas redundantes."
              hint={
                <span>
                  Actualmente:{" "}
                  <strong style={{ color: debounceColor(settings.message_debounce_seconds) }}>
                    {debounceLabel(settings.message_debounce_seconds)}
                  </strong>
                  {saving === "message_debounce_seconds" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#9ca3af" }}>Guardando…</span>
                  )}
                  {saved === "message_debounce_seconds" && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Guardado</span>
                  )}
                </span>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={settings.message_debounce_seconds}
                    onChange={(e) => handleDebounceChange(parseInt(e.target.value))}
                    onMouseUp={(e) => handleDebounceCommit(parseInt((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleDebounceCommit(parseInt((e.target as HTMLInputElement).value))}
                    style={{ flex: 1, accentColor: debounceColor(settings.message_debounce_seconds), cursor: "pointer", height: 4 }}
                  />
                  <div
                    style={{
                      minWidth: 52,
                      height: 36,
                      borderRadius: 8,
                      background: debounceColor(settings.message_debounce_seconds) + "15",
                      border: `1.5px solid ${debounceColor(settings.message_debounce_seconds)}40`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: debounceColor(settings.message_debounce_seconds),
                    }}
                  >
                    {settings.message_debounce_seconds}s
                  </div>
                </div>

                {/* Marcas del slider */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", paddingRight: 66 }}>
                  <span>0s</span>
                  <span>15s</span>
                  <span>30s</span>
                  <span>45s</span>
                  <span>60s</span>
                </div>

                {/* Advertencia si es muy alto */}
                {settings.message_debounce_seconds > 20 && (
                  <div style={{ display: "flex", gap: 8, background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e" }}>
                    <span>⚠️</span>
                    <span>Un tiempo alto puede hacer que el bot parezca lento. Se recomienda entre 3 y 10 segundos.</span>
                  </div>
                )}

                {/* Ejemplos visuales */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 4 }}>
                  {[
                    { label: "Inmediato", value: 0, desc: "Responde a cada mensaje por separado" },
                    { label: "Recomendado", value: 5, desc: "Agrupa mensajes enviados en 5s" },
                    { label: "Conservador", value: 15, desc: "Espera hasta que el usuario termine" },
                  ].map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        handleDebounceChange(preset.value)
                        handleDebounceCommit(preset.value)
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: settings.message_debounce_seconds === preset.value
                          ? `2px solid ${debounceColor(preset.value)}`
                          : "1px solid #e5e7eb",
                        background: settings.message_debounce_seconds === preset.value
                          ? debounceColor(preset.value) + "10"
                          : "white",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                        {preset.label} · {preset.value}s
                      </div>
                      <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.3 }}>{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </SettingRow>

          </Section>

        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#111827" }}>{title}</h2>
      </div>
      <div style={{ padding: "4px 0" }}>
        {children}
      </div>
    </div>
  )
}

function SettingRow({
  title,
  description,
  hint,
  children,
}: {
  title: string
  description: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid #f9fafb" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 3 }}>{title}</div>
          <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{description}</div>
          {hint && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{hint}</div>}
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

export default function PlantillasPage() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1>Plantillas</h1>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          padding: "24px",
        }}
      >
        <p style={{ marginTop: 0, marginBottom: "8px" }}>
          Aquí vas a poder crear y gestionar plantillas reutilizables para tu plataforma.
        </p>
        <p style={{ margin: 0, color: "#6b7280" }}>
          Aún no hay nada creado. Más adelante podemos añadir una tabla parecida a la de
          contactos, con filtros y acciones masivas.
        </p>
      </div>
    </div>
  )
}

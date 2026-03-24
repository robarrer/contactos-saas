-- Agregar columna tags a conversations para almacenar etiquetas de la conversación
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- ============================================================
-- Garantizar que phone sea único por organización en contacts
-- ============================================================

-- 1. Normalizar todos los teléfonos al formato "+número"
--    Si un teléfono no empieza con "+" se le agrega.
UPDATE contacts
SET phone = '+' || phone
WHERE phone IS NOT NULL
  AND phone <> ''
  AND phone NOT LIKE '+%';

-- 2. Eliminar duplicados por (organization_id, phone)
--    En caso de duplicado se conserva el registro más antiguo (menor created_at).
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY organization_id, phone
             ORDER BY created_at ASC
           ) AS rn
    FROM contacts
    WHERE organization_id IS NOT NULL
      AND phone IS NOT NULL
      AND phone <> ''
  ) ranked
  WHERE rn > 1
);

-- 3. Eliminar duplicados entre contactos huérfanos (sin organization_id)
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY phone
             ORDER BY created_at ASC
           ) AS rn
    FROM contacts
    WHERE organization_id IS NULL
      AND phone IS NOT NULL
      AND phone <> ''
  ) ranked
  WHERE rn > 1
);

-- 4. Índice único por (organization_id, phone) para contacts con org asignada
--    Evita duplicados a nivel de base de datos para futuros inserts.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_per_org
  ON contacts (organization_id, phone)
  WHERE organization_id IS NOT NULL
    AND phone IS NOT NULL
    AND phone <> '';

-- 5. Índice único por phone para contacts huérfanos (sin organization_id)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_phone_no_org
  ON contacts (phone)
  WHERE organization_id IS NULL
    AND phone IS NOT NULL
    AND phone <> '';

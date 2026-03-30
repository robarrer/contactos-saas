-- ============================================================
-- Corregir constraint de email en contacts para multi-tenancy
-- El constraint global "contacts_email_key" impide que dos
-- organizaciones distintas tengan un contacto con el mismo email.
-- Se reemplaza por un índice único por (organization_id, email).
-- ============================================================

-- 1. Eliminar la constraint global de unicidad en email (si existe)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_key;

-- 2. Eliminar cualquier índice único global en email (si existe)
DROP INDEX IF EXISTS contacts_email_key;

-- 3. Eliminar duplicados por (organization_id, email)
--    En caso de duplicado se conserva el registro más antiguo (menor created_at).
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY organization_id, email
             ORDER BY created_at ASC
           ) AS rn
    FROM contacts
    WHERE organization_id IS NOT NULL
      AND email IS NOT NULL
      AND email <> ''
  ) ranked
  WHERE rn > 1
);

-- 4. Eliminar duplicados entre contactos huérfanos (sin organization_id)
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY email
             ORDER BY created_at ASC
           ) AS rn
    FROM contacts
    WHERE organization_id IS NULL
      AND email IS NOT NULL
      AND email <> ''
  ) ranked
  WHERE rn > 1
);

-- 5. Índice único por (organization_id, email) para contacts con org asignada
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_per_org
  ON contacts (organization_id, email)
  WHERE organization_id IS NOT NULL
    AND email IS NOT NULL
    AND email <> '';

-- 6. Índice único por email para contacts huérfanos (sin organization_id)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_no_org
  ON contacts (email)
  WHERE organization_id IS NULL
    AND email IS NOT NULL
    AND email <> '';

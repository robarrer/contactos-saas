-- Seguimientos automáticos por agente.
-- Cada agente puede tener hasta 6 seguimientos configurados.
-- Se almacenan como array JSONB directamente en la tabla agents.
-- Estructura de cada elemento:
--   { "delay_hours": 2, "delay_minutes": 30, "objective": "...", "enabled": true }
alter table agents add column if not exists followups jsonb not null default '[]';

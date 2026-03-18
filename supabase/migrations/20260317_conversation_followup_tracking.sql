-- Seguimiento del estado de followups por conversación.
-- last_bot_at:    timestamp del último mensaje outbound del bot (para calcular cuándo disparar cada followup).
-- followup_sent:  array de índices (0-based) de followups ya enviados en el ciclo actual.
--                 Se resetea cuando el contacto responde (llega un inbound).
alter table conversations add column if not exists last_bot_at    timestamptz;
alter table conversations add column if not exists followup_sent  jsonb not null default '[]';

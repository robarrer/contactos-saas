-- Agregar organization_id a pipeline_stages
alter table pipeline_stages
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Asignar org a etapas existentes derivándola del agente asignado (cuando existe)
update pipeline_stages ps
set organization_id = a.organization_id
from agents a
where ps.agent_id = a.id
  and ps.organization_id is null;

-- Para las etapas sin agente asignado: asignarlas a la org más antigua (org "principal")
update pipeline_stages
set organization_id = (
  select id from organizations order by created_at asc limit 1
)
where organization_id is null;

-- Agregar organization_id a canned_responses
alter table canned_responses
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Asignar respuestas existentes a la org más antigua (org "principal")
update canned_responses
set organization_id = (
  select id from organizations order by created_at asc limit 1
)
where organization_id is null;

-- Agregar índices para performance
create index if not exists pipeline_stages_org_idx on pipeline_stages(organization_id);
create index if not exists canned_responses_org_idx on canned_responses(organization_id);

-- Actualizar unique constraint en settings para soportar por org
-- (settings ya tenía unique(key) global; ahora debe ser unique(key, organization_id))
do $$
begin
  -- Eliminar constraint antigua si existe (puede llamarse de varias formas)
  if exists (
    select 1 from pg_constraint
    where conname = 'settings_key_key' and conrelid = 'settings'::regclass
  ) then
    alter table settings drop constraint settings_key_key;
  end if;
end $$;

alter table settings
  add column if not exists organization_id uuid references organizations(id) on delete cascade;

-- Asignar settings existentes a la org más antigua
update settings
set organization_id = (
  select id from organizations order by created_at asc limit 1
)
where organization_id is null;

-- Nueva unique constraint por (key, organization_id)
alter table settings
  drop constraint if exists settings_key_org_key;

alter table settings
  add constraint settings_key_org_key unique (key, organization_id);

create index if not exists settings_org_idx on settings(organization_id);

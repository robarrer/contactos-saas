-- Eliminar tablas anteriores del diseño genérico
drop table if exists agent_functions;
drop table if exists agent_integrations;

-- Integraciones a plataformas pre-configuradas por el sistema
-- platform: 'dentalink' | 'shopify' | etc. (definidas en el catálogo del código)
-- config: credenciales específicas de la plataforma (api_token, api_url, etc.)
-- enabled_functions: array de IDs de funciones habilitadas para este agente
create table if not exists agent_integrations (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid not null references agents(id) on delete cascade,
  platform          text not null,
  config            jsonb not null default '{}',
  enabled           boolean not null default true,
  enabled_functions jsonb not null default '[]',
  created_at        timestamptz default now(),
  constraint agent_integrations_unique unique(agent_id, platform)
);

alter table agent_integrations enable row level security;

create policy "agent_integrations_org" on agent_integrations
  using (
    agent_id in (select id from agents where organization_id = get_org_id())
  )
  with check (
    agent_id in (select id from agents where organization_id = get_org_id())
  );

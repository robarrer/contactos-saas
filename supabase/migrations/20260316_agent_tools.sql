-- Tabla de herramientas/funciones por agente IA
create table if not exists agent_tools (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references agents(id) on delete cascade,
  name        text not null,
  description text not null default '',
  enabled     boolean not null default true,
  http_method text not null default 'GET',
  url         text not null,
  headers     jsonb not null default '{}',
  parameters  jsonb not null default '[]',
  created_at  timestamptz default now()
);

alter table agent_tools enable row level security;

-- Acceso basado en la organización del agente propietario (no requiere org_id propio)
create policy "agent_tools_org" on agent_tools
  using (
    agent_id in (
      select id from agents where organization_id = get_org_id()
    )
  )
  with check (
    agent_id in (
      select id from agents where organization_id = get_org_id()
    )
  );

-- Base de conocimiento CSV por agente
-- Cada fila representa un archivo CSV cargado para un agente.
-- Los datos se almacenan como JSONB para permitir búsqueda exacta en runtime.
create table if not exists agent_csv_knowledge (
  id            uuid        primary key default gen_random_uuid(),
  agent_id      uuid        not null references agents(id) on delete cascade,
  name          text        not null,
  search_column text        not null,
  headers       text[]      not null default '{}',
  rows          jsonb       not null default '[]',
  row_count     int         not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists agent_csv_knowledge_agent_id_idx
  on agent_csv_knowledge(agent_id);

alter table agent_csv_knowledge enable row level security;

create policy "agent_csv_knowledge_org" on agent_csv_knowledge
  using (
    agent_id in (select id from agents where organization_id = get_org_id())
  )
  with check (
    agent_id in (select id from agents where organization_id = get_org_id())
  );

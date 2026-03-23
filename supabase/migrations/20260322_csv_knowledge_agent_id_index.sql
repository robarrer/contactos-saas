-- Índice en agent_csv_knowledge(agent_id) para acelerar la carga de KBs bajo carga concurrente.
-- Sin este índice, 10 queries simultáneas a la tabla saturan Supabase y dan statement timeout.
CREATE INDEX IF NOT EXISTS idx_agent_csv_knowledge_agent_id
  ON agent_csv_knowledge(agent_id);

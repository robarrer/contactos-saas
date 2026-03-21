-- Agrega campo mode a agent_csv_knowledge
-- 'exact'   → búsqueda exacta por search_column (comportamiento original)
-- 'catalog' → búsqueda flexible multi-columna para catálogos de productos
alter table agent_csv_knowledge
  add column if not exists mode text not null default 'exact'
  check (mode in ('exact', 'catalog'));

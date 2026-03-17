-- Agregar first_name y last_name a contacts
alter table contacts add column if not exists first_name text;
alter table contacts add column if not exists last_name text;

-- Migrar datos existentes: dividir name en first_name y last_name
update contacts
set
  first_name = split_part(trim(name), ' ', 1),
  last_name  = case
    when position(' ' in trim(name)) > 0
    then trim(substring(trim(name) from position(' ' in trim(name)) + 1))
    else ''
  end
where name is not null and (first_name is null or last_name is null);

-- Para registros sin name, usar vacío
update contacts set first_name = coalesce(first_name, ''), last_name = coalesce(last_name, '') where first_name is null or last_name is null;

-- Eliminar columna name
alter table contacts drop column if exists name;

-- Hacer las columnas not null con default
alter table contacts alter column first_name set default '';
alter table contacts alter column last_name set default '';
alter table contacts alter column first_name set not null;
alter table contacts alter column last_name set not null;

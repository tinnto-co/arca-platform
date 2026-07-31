-- Fase 1b: trigger genérico para mantener updated_at en cada UPDATE.
-- Se aplica a TODA tabla de public que tenga columna updated_at (menos empleados_categorias).
-- Idempotente: dropea y recrea el trigger por tabla.
-- APLICAR SOLO EN NEW_DB.

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_at'
      and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'empleados_categorias'
  loop
    execute format('drop trigger if exists trg_set_updated_at on %I', t.table_name);
    execute format(
      'create trigger trg_set_updated_at before update on %I for each row execute function set_updated_at()',
      t.table_name
    );
  end loop;
end;
$$;

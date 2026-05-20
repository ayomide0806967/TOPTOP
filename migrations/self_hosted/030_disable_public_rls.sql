do $$
declare
  row record;
begin
  for row in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table %I.%I disable row level security', row.schemaname, row.tablename);
  end loop;
end
$$;

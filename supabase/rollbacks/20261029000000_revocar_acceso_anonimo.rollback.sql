-- Deshace 20261029000000_revocar_acceso_anonimo.sql (vuelve a los
-- privilegios por defecto de Supabase). Solo usar si algo deja de funcionar.

begin;

grant select, insert, update, delete, truncate, references, trigger
  on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;
grant execute on all functions in schema public to public, anon;

alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant execute on functions to public, anon;

commit;

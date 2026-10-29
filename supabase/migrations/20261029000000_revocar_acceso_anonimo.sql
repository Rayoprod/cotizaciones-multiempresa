-- Cierra el acceso anónimo (rol `anon`) al esquema public.
--
-- Contexto: con solo la anon key, sin iniciar sesión, se podían leer
-- cotizaciones (con DNI/RUC, teléfono y dirección de clientes), empresas y
-- cuentas bancarias. La app no necesita nada de public antes del login:
-- todas las consultas ocurren después de signInWithPassword, con el rol
-- `authenticated`, que este script no toca.
--
-- Esto es la primera capa. El aislamiento entre empresas para usuarios
-- autenticados se revisa aparte con supabase/diagnostico_rls.sql.
--
-- Reversible con supabase/rollbacks/20261029000000_revocar_acceso_anonimo.rollback.sql

begin;

-- Tablas y vistas
revoke all on all tables in schema public from anon;

-- Secuencias
revoke all on all sequences in schema public from anon;

-- Funciones: Postgres da EXECUTE a PUBLIC por defecto y anon lo hereda,
-- así que hay que quitarlo de PUBLIC. Se re-otorga explícitamente a
-- authenticated y service_role para que la app (y las funciones usadas
-- dentro de políticas RLS) sigan funcionando igual.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Que las tablas y funciones nuevas tampoco nazcan abiertas para anon.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

commit;

-- Verificación: debe devolver 0 filas.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public';

-- Deshace 20261030030000_mis_empresas.sql. El frontend que la usa deja de
-- cargar las empresas: revertir también el despliegue.

begin;

drop function if exists public.mis_empresas(boolean);

commit;

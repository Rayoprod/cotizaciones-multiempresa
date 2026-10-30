-- Empresas del usuario en un solo pedido.
--
-- Antes: para saber sus empresas la app hacía 4 pedidos seguidos (usuario,
-- perfil, asignaciones y empresas + cuentas). Con 0.3–1.6 s por pedido hasta
-- us-east-1, abrir la app o el selector tardaba varios segundos.
-- Después: mis_empresas() devuelve las empresas que el usuario puede ver
-- (las filtra RLS, porque es SECURITY INVOKER), cada una con sus cuentas
-- bancarias y `mi_rol` (su rol en esa empresa; 'admin' para el superadmin).
--
-- Reversible con supabase/rollbacks/20261030030000_mis_empresas.rollback.sql

begin;

create function public.mis_empresas(p_incluir_inactivas boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(
           to_jsonb(e) || jsonb_build_object(
             'mi_rol', case when public.es_superadmin() then 'admin'
                            else (select ue.rol from public.usuario_empresa ue
                                   where ue.usuario_id = (select auth.uid()) and ue.empresa_id = e.id) end,
             'cuentas_bancarias', coalesce((select jsonb_agg(to_jsonb(c) order by c.orden, c.created_at)
                                              from public.cuentas_bancarias c
                                             where c.empresa_id = e.id), '[]'::jsonb)
           ) order by e.id), '[]'::jsonb)
    from public.empresas e
   where p_incluir_inactivas or coalesce(e.activa, true);
$$;

revoke all on function public.mis_empresas(boolean) from public, anon;
grant execute on function public.mis_empresas(boolean) to authenticated, service_role;

commit;

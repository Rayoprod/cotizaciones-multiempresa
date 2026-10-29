-- Prueba el aislamiento simulando a un usuario real, sin iniciar sesión.
-- Todo corre dentro de una transacción que se deshace al final: no modifica nada.
--
-- Uso: cambia el correo de abajo por el de un VENDEDOR real y ejecuta todo
-- en Supabase → SQL Editor. Repite con un admin_empresa y con el superadmin.

begin;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id from auth.users where email = 'vendedor@ejemplo.com'),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Intentos de escalar privilegios (deben afectar 0 filas). Los CTE que
-- modifican datos tienen que ir arriba del todo; el rollback los deshace.
with intento_rol as (
  update profiles set rol = rol where id = auth.uid() returning 1
), intento_asignacion as (
  update usuario_empresa set activo = activo returning 1
)
select json_build_object(
  'usuario', (select json_build_object('id', id, 'rol', rol, 'activo', activo) from profiles where id = auth.uid()),
  'empresas_asignadas', (select json_agg(empresa_id) from usuario_empresa where usuario_id = auth.uid()),
  -- Lo que este usuario VE ahora, por empresa. Solo deben aparecer sus empresas.
  'cotizaciones_visibles', (select json_object_agg(empresa_id, n) from (select empresa_id, count(*) n from cotizaciones group by 1) t),
  'clientes_visibles', (select json_object_agg(empresa_id, n) from (select empresa_id, count(*) n from clientes group by 1) t),
  'productos_visibles', (select json_object_agg(empresa_id, n) from (select empresa_id, count(*) n from productos group by 1) t),
  'empresas_visibles', (select json_agg(id) from empresas),
  'perfiles_visibles', (select count(*) from profiles),
  'puede_cambiarse_rol', (select count(*) from intento_rol),
  'puede_asignarse_empresas', (select count(*) from intento_asignacion)
) as resultado;

rollback;

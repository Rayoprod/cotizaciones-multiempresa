-- Deshace 20261029030000_cotizaciones_solo_por_funcion.sql.
-- Las funciones se recrean tal como estaban en la BD el 2026-10-29.

begin;

grant insert, update, delete on public.cotizaciones to authenticated;
grant insert, update, delete on public.folios_empresas to authenticated;

create or replace function public.getnextfolioempresa(empresaid text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nueva_secuencia integer;
  prefijo_empresa text;
begin
  if not public.tiene_acceso_empresa(empresaid) then
    raise exception 'Sin acceso a la empresa %', empresaid using errcode = '42501';
  end if;

  select prefijo into prefijo_empresa from public.empresas where id = empresaid;
  if prefijo_empresa is null or prefijo_empresa = '' then
    prefijo_empresa := upper(left(empresaid, 3));
  end if;

  insert into public.folios_empresas (empresa_codigo, secuencia)
  values (empresaid, 1)
  on conflict (empresa_codigo)
  do update set secuencia = public.folios_empresas.secuencia + 1
  returning secuencia into nueva_secuencia;

  return prefijo_empresa || '-' || lpad(nueva_secuencia::text, 8, '0');
end;
$function$;

create or replace function public.get_next_folio_empresa(empresaid text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
      BEGIN
        RETURN public.getnextfolioempresa(empresaid);
      END;
      $function$;

create or replace function public.sync_horometro_actual()
returns trigger
language plpgsql
as $function$
BEGIN
  UPDATE public.maquinaria
  SET horometro_actual = NEW.horometro
  WHERE id = NEW.maquina_id
    AND (horometro_actual IS NULL OR NEW.horometro > horometro_actual);
  RETURN NEW;
END;
$function$;

create or replace function public.sync_ultimo_mantenimiento()
returns trigger
language plpgsql
as $function$
BEGIN
  IF NEW.tipo_evento = 'mantenimiento' THEN
    UPDATE public.maquinaria
    SET ultimo_mantenimiento = NEW.horometro
    WHERE id = NEW.maquina_id;
  END IF;
  RETURN NEW;
END;
$function$;

revoke all on function public.getnextfolioempresa(text) from public, anon;
revoke all on function public.get_next_folio_empresa(text) from public, anon;
grant execute on function public.getnextfolioempresa(text) to authenticated, service_role;
grant execute on function public.get_next_folio_empresa(text) to authenticated, service_role;

commit;

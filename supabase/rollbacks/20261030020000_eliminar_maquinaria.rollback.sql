-- Deshace 20261030020000_eliminar_maquinaria.sql: recrea tablas, índices,
-- políticas, trigger y vista tal como estaban (definición tomada de la BD el
-- 2026-10-30). Las tablas quedan vacías; los datos se restauran después con
-- .backups/20261030_maquinaria_restaurar.sql. El frontend actual ya no usa
-- maquinaria: para volver a verla hay que revertir también ese commit.

begin;

create table public.maquinaria (
  id uuid default gen_random_uuid() not null,
  empresa_id text not null,
  nombre text not null,
  descripcion text,
  tipo text,
  marca text,
  modelo text,
  precio_hora numeric(12,2),
  precio_dia numeric(12,2),
  precio_mes numeric(12,2),
  precio_venta numeric(12,2),
  unidad_medida text default 'unidad'::text,
  activa boolean default true,
  created_at timestamp with time zone default now(),
  codigo text,
  numero_serie text,
  placa text,
  anio_fabricacion integer,
  estado text default 'operativa'::text,
  horometro_inicial numeric default 0,
  horometro_actual numeric default 0,
  intervalo_mantenimiento numeric,
  ultimo_mantenimiento numeric,
  constraint maquinaria_pkey PRIMARY KEY (id),
  constraint maquinaria_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON UPDATE CASCADE ON DELETE CASCADE,
  constraint maquinaria_estado_check CHECK ((estado = ANY (ARRAY['operativa'::text, 'mantenimiento'::text, 'baja'::text])))
);

create table public.lecturas_horometro (
  id uuid default gen_random_uuid() not null,
  maquina_id uuid not null,
  horometro numeric not null,
  fecha_lectura date default CURRENT_DATE not null,
  tipo_evento text default 'lectura'::text,
  operador text,
  observaciones text,
  created_at timestamp with time zone default now(),
  constraint lecturas_horometro_pkey PRIMARY KEY (id),
  constraint lecturas_horometro_maquina_id_fkey FOREIGN KEY (maquina_id) REFERENCES maquinaria(id) ON DELETE CASCADE,
  constraint lecturas_horometro_tipo_evento_check CHECK ((tipo_evento = ANY (ARRAY['lectura'::text, 'mantenimiento'::text, 'reparacion'::text])))
);

CREATE INDEX idx_lecturas_horometro_maquina_fecha ON public.lecturas_horometro USING btree (maquina_id, fecha_lectura DESC);
CREATE INDEX idx_maquinaria_empresa ON public.maquinaria USING btree (empresa_id);
CREATE INDEX idx_maquinaria_empresa_id ON public.maquinaria USING btree (empresa_id);

alter table public.maquinaria enable row level security;
alter table public.lecturas_horometro enable row level security;

create policy maquinaria_por_empresa on public.maquinaria
  for all to authenticated
  using (tiene_acceso_empresa(empresa_id))
  with check (tiene_acceso_empresa(empresa_id));

create policy lecturas_por_empresa on public.lecturas_horometro
  for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM maquinaria m
  WHERE ((m.id = lecturas_horometro.maquina_id) AND tiene_acceso_empresa(m.empresa_id)))))
  with check ((EXISTS ( SELECT 1
   FROM maquinaria m
  WHERE ((m.id = lecturas_horometro.maquina_id) AND tiene_acceso_empresa(m.empresa_id)))));

CREATE OR REPLACE FUNCTION public.fn_sync_horometro_maquinaria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      target_maquina_id uuid;
      v_max_horometro numeric;
      v_ultimo_mant numeric;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        target_maquina_id := OLD.maquina_id;
      ELSE
        target_maquina_id := NEW.maquina_id;
      END IF;

      SELECT MAX(horometro) INTO v_max_horometro
      FROM public.lecturas_horometro
      WHERE maquina_id = target_maquina_id;

      SELECT MAX(horometro) INTO v_ultimo_mant
      FROM public.lecturas_horometro
      WHERE maquina_id = target_maquina_id AND tipo_evento = 'mantenimiento';

      UPDATE public.maquinaria
      SET horometro_actual = COALESCE(v_max_horometro, horometro_inicial, 0),
          ultimo_mantenimiento = COALESCE(v_ultimo_mant, ultimo_mantenimiento, horometro_inicial, 0)
      WHERE id = target_maquina_id;

      IF TG_OP = 'UPDATE' AND OLD.maquina_id IS DISTINCT FROM NEW.maquina_id THEN
        SELECT MAX(horometro) INTO v_max_horometro
        FROM public.lecturas_horometro
        WHERE maquina_id = OLD.maquina_id;

        SELECT MAX(horometro) INTO v_ultimo_mant
        FROM public.lecturas_horometro
        WHERE maquina_id = OLD.maquina_id AND tipo_evento = 'mantenimiento';

        UPDATE public.maquinaria
        SET horometro_actual = COALESCE(v_max_horometro, horometro_inicial, 0),
            ultimo_mantenimiento = COALESCE(v_ultimo_mant, ultimo_mantenimiento, horometro_inicial, 0)
        WHERE id = OLD.maquina_id;
      END IF;

      RETURN NULL;
    END;
    $function$;

revoke all on function public.fn_sync_horometro_maquinaria() from public, anon, authenticated;

CREATE TRIGGER trg_sync_horometro_maquinaria AFTER INSERT OR DELETE OR UPDATE ON public.lecturas_horometro FOR EACH ROW EXECUTE FUNCTION fn_sync_horometro_maquinaria();

create view public.v_flota_mantenimiento with (security_invoker=true) as
 SELECT id,
    empresa_id,
    nombre,
    descripcion,
    tipo,
    marca,
    modelo,
    precio_hora,
    precio_dia,
    precio_mes,
    precio_venta,
    unidad_medida,
    activa,
    created_at,
    codigo,
    numero_serie,
    placa,
    anio_fabricacion,
    estado,
    horometro_inicial,
    horometro_actual,
    intervalo_mantenimiento,
    ultimo_mantenimiento,
        CASE
            WHEN intervalo_mantenimiento IS NULL THEN 'sin_umbral'::text
            WHEN (horometro_actual - COALESCE(ultimo_mantenimiento, horometro_inicial, 0::numeric)) >= intervalo_mantenimiento THEN 'vencido'::text
            WHEN (horometro_actual - COALESCE(ultimo_mantenimiento, horometro_inicial, 0::numeric)) >= (intervalo_mantenimiento * 0.85) THEN 'proximo'::text
            ELSE 'al_dia'::text
        END AS estado_mantenimiento,
    horometro_actual - COALESCE(ultimo_mantenimiento, horometro_inicial, 0::numeric) AS horas_desde_ultimo_mant,
    GREATEST(0::numeric, intervalo_mantenimiento - (horometro_actual - COALESCE(ultimo_mantenimiento, horometro_inicial, 0::numeric))) AS horas_restantes
   FROM maquinaria m
  WHERE activa = true;

revoke all on public.maquinaria, public.lecturas_horometro, public.v_flota_mantenimiento from anon;
grant select, insert, update, delete on public.maquinaria, public.lecturas_horometro, public.v_flota_mantenimiento to authenticated;
grant all on public.maquinaria, public.lecturas_horometro, public.v_flota_mantenimiento to service_role;

commit;

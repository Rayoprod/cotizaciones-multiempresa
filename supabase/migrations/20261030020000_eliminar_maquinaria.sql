-- Retira el módulo de maquinaria.
--
-- El frontend dejó de usarlo en el commit "Roles por empresa, lugares de
-- entrega por empresa y sin maquinaria". Datos al 2026-10-30:
-- 1 equipo(s) y 7 lectura(s) de horómetro, respaldados con su
-- definición en .backups/20261030_maquinaria.json (fuera de git: datos reales).
-- Las cotizaciones con líneas de maquinaria no cambian: son texto en `items`.
--
-- Rollback de la estructura: supabase/rollbacks/20261030020000_eliminar_maquinaria.rollback.sql
-- Datos: .backups/20261030_maquinaria_restaurar.sql (después del rollback).

begin;

drop view public.v_flota_mantenimiento;
drop trigger trg_sync_horometro_maquinaria on public.lecturas_horometro;
drop function public.fn_sync_horometro_maquinaria();
drop table public.lecturas_horometro;
drop table public.maquinaria;

commit;

-- ============================================================================
-- Migración: Mover cuentas_bancarias de JSONB (empresas) a tabla dedicada
-- Ejecutar en SQL Editor de Supabase
-- ============================================================================

-- 1. Insertar cuentas desde el JSONB de empresas a la tabla cuentas_bancarias
INSERT INTO cuentas_bancarias (empresa_id, banco, tipo_cuenta, moneda, numero, cci, titular, activa, orden)
SELECT
  e.id AS empresa_id,
  c->>'banco' AS banco,
  COALESCE(c->>'tipo_cuenta', 'Corriente') AS tipo_cuenta,
  COALESCE(c->>'moneda', 'PEN') AS moneda,
  c->>'numero' AS numero,
  NULLIF(c->>'cci', '') AS cci,
  NULLIF(c->>'titular', '') AS titular,
  true AS activa,
  row_number() OVER (PARTITION BY e.id ORDER BY c->>'banco') - 1 AS orden
FROM empresas e,
     jsonb_array_elements(e.cuentas_bancarias) AS c
WHERE e.cuentas_bancarias IS NOT NULL
  AND jsonb_array_length(e.cuentas_bancarias) > 0
  AND c->>'banco' IS NOT NULL
  AND c->>'numero' IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Verificar migración
SELECT e.id, e.nombre_comercial, COUNT(cb.id) AS cuentas_migradas
FROM empresas e
LEFT JOIN cuentas_bancarias cb ON cb.empresa_id = e.id
GROUP BY e.id, e.nombre_comercial
ORDER BY e.id;

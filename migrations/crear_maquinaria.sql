-- Tabla de maquinaria/equipos por empresa
CREATE TABLE IF NOT EXISTS maquinaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT,
  marca TEXT,
  modelo TEXT,
  precio_hora NUMERIC(12,2),
  precio_dia NUMERIC(12,2),
  precio_mes NUMERIC(12,2),
  precio_venta NUMERIC(12,2),
  unidad_medida TEXT DEFAULT 'unidad',
  activa BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_maquinaria_empresa ON maquinaria(empresa_id);

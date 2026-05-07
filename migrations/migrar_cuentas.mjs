// Migración: Mover cuentas_bancarias de JSONB (empresas) a tabla dedicada
// Ejecutar con: node migrations/migrar_cuentas.mjs

const SUPABASE_URL = 'https://rgnebklwuxpuuzappavx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmVia2x3dXhwdXV6YXBwYXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTI0OTAsImV4cCI6MjA5MTE4ODQ5MH0.gTfCHns3i2bE3l45G6LGV-O8ZRI-xY0tG0QK4q7KnGU';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

async function main() {
  // 1. Obtener todas las empresas con cuentas_bancarias
  console.log('🔍 Leyendo empresas...');
  const resEmpresas = await fetch(
    `${SUPABASE_URL}/rest/v1/empresas?select=id,nombre_comercial,cuentas_bancarias`,
    { headers: { ...headers, 'Content-Type': undefined } }
  );
  const empresas = await resEmpresas.json();
  console.log(`📋 ${empresas.length} empresas encontradas`);

  let totalMigradas = 0;

  for (const empresa of empresas) {
    const cuentas = empresa.cuentas_bancarias;
    if (!Array.isArray(cuentas) || cuentas.length === 0) {
      console.log(`  ⏭️  ${empresa.id} (${empresa.nombre_comercial}): sin cuentas`);
      continue;
    }

    // Filtrar cuentas válidas
    const cuentasValidas = cuentas.filter(c => c.banco?.trim() && c.numero?.trim());
    if (cuentasValidas.length === 0) continue;

    // 2. Eliminar cuentas existentes de esta empresa
    await fetch(
      `${SUPABASE_URL}/rest/v1/cuentas_bancarias?empresa_id=eq.${encodeURIComponent(empresa.id)}`,
      { method: 'DELETE', headers }
    );

    // 3. Insertar las cuentas del JSONB
    const filas = cuentasValidas.map((c, i) => ({
      empresa_id: empresa.id,
      banco: c.banco,
      tipo_cuenta: c.tipo_cuenta || 'Corriente',
      moneda: c.moneda || 'PEN',
      numero: c.numero,
      cci: c.cci || null,
      titular: c.titular || null,
      activa: c.activa ?? true,
      orden: c.orden ?? i
    }));

    const resInsert = await fetch(`${SUPABASE_URL}/rest/v1/cuentas_bancarias`, {
      method: 'POST',
      headers,
      body: JSON.stringify(filas)
    });

    if (resInsert.ok) {
      console.log(`  ✅ ${empresa.id} (${empresa.nombre_comercial}): ${filas.length} cuentas migradas`);
      totalMigradas += filas.length;
    } else {
      const err = await resInsert.text();
      console.log(`  ❌ ${empresa.id}: error - ${err}`);
    }
  }

  console.log(`\n🎉 Migración completa: ${totalMigradas} cuentas migradas`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

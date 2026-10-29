/**
 * Función serverless de Vercel: consulta DNI (RENIEC) o RUC (SUNAT) en Decolecta.
 *
 * - El token DECOLECTA_TOKEN vive solo como variable de entorno de Vercel,
 *   nunca en el frontend.
 * - Solo responde a usuarios con sesión de Supabase, para que nadie de afuera
 *   pueda gastar la cuota.
 * - Devuelve los datos ya normalizados: { tipo, numero, nombre, direccion }.
 *
 * Variables de entorno requeridas: DECOLECTA_TOKEN, SUPABASE_URL, SUPABASE_ANON_KEY.
 */

// Límite simple en memoria por usuario (se reinicia con cada instancia fría).
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 30;
const consultas = new Map<string, { count: number; resetAt: number }>();

function excedeLimite(clave: string): boolean {
  const ahora = Date.now();
  if (consultas.size > 10_000) {
    for (const [k, v] of consultas) if (v.resetAt < ahora) consultas.delete(k);
  }
  const registro = consultas.get(clave);
  if (!registro || registro.resetAt < ahora) {
    consultas.set(clave, { count: 1, resetAt: ahora + VENTANA_MS });
    return false;
  }
  registro.count += 1;
  return registro.count > MAX_POR_VENTANA;
}

async function usuarioDeLaSesion(authHeader: string | undefined): Promise<string | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const url = process.env['SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'];
  if (!token || !url || !anonKey) return null;

  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user?.id ?? null;
}

function normalizar(tipo: 'dni' | 'ruc', numero: string, d: any) {
  if (tipo === 'dni') {
    const nombre = d.full_name ||
      [d.first_name, d.first_last_name, d.second_last_name].filter(Boolean).join(' ');
    return { tipo, numero, nombre: String(nombre || '').trim(), direccion: '' };
  }
  return {
    tipo,
    numero,
    nombre: String(d.razon_social || d.nombre_o_razon_social || '').trim(),
    direccion: String(d.direccion || '').trim()
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const usuarioId = await usuarioDeLaSesion(req.headers['authorization']);
  if (!usuarioId) {
    return res.status(401).json({ message: 'Inicia sesión para consultar documentos.' });
  }
  if (excedeLimite(usuarioId)) {
    return res.status(429).json({ message: 'Demasiadas consultas. Espera un momento.' });
  }

  const numero = String(req.query.numero || '').trim();
  const tipo = /^\d{8}$/.test(numero) ? 'dni' : /^\d{11}$/.test(numero) ? 'ruc' : null;
  if (!tipo) {
    return res.status(400).json({ message: 'El DNI debe tener 8 dígitos y el RUC 11.' });
  }

  const token = process.env['DECOLECTA_TOKEN'];
  if (!token) {
    console.error('Falta la variable DECOLECTA_TOKEN en Vercel.');
    return res.status(500).json({ message: 'El servicio de consulta no está configurado.' });
  }

  const ruta = tipo === 'dni' ? 'reniec/dni' : 'sunat/ruc';
  try {
    const r = await fetch(`https://api.decolecta.com/v1/${ruta}?numero=${numero}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    });
    if (r.status === 404 || r.status === 422) {
      return res.status(404).json({ message: `No se encontraron datos para ${numero}.` });
    }
    if (!r.ok) {
      console.error('Decolecta respondió', r.status);
      return res.status(502).json({ message: 'El servicio de SUNAT/RENIEC no respondió.' });
    }
    const datos = normalizar(tipo, numero, await r.json());
    if (!datos.nombre) {
      return res.status(404).json({ message: `No se encontraron datos para ${numero}.` });
    }
    return res.status(200).json(datos);
  } catch (e: any) {
    console.error('Error consultando Decolecta:', e?.message || e);
    return res.status(502).json({ message: 'No se pudo conectar con SUNAT/RENIEC.' });
  }
}

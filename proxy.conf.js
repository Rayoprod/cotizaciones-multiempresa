// En local, `ng serve` no ejecuta las funciones de /api (Vercel).
// Para probar la consulta DNI/RUC, apunta /api a tu deploy de Vercel:
//   API_PROXY_TARGET=https://tu-app.vercel.app npm start
const target = process.env.API_PROXY_TARGET;

if (!target) {
  console.warn('[proxy] Sin API_PROXY_TARGET: la consulta DNI/RUC no funcionará en local.');
}

module.exports = target
  ? { '/api': { target, secure: true, changeOrigin: true } }
  : {};

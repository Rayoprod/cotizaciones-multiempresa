// Genera src/theme/lara-acento.css a partir del tema Lara de PrimeNG.
//
// El tema trae el azul escrito a mano en cientos de reglas, así que cambiar
// --primary-color no alcanza. Aquí se reemplaza ese azul por variables que la app
// llena con el color de la empresa (ver src/app/services/tema.ts).
// Se quita además la fuente Inter: la app usa Plus Jakarta Sans.
//
// Volver a correrlo al actualizar PrimeNG: node scripts/generar-tema.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ORIGEN = 'node_modules/primeng/resources/themes/lara-light-blue/theme.css';
const DESTINO = 'src/theme/lara-acento.css';

const COLORES = new Map([
  ['#3b82f6', 'var(--acento)'],
  ['#2563eb', 'var(--acento-hover)'],
  ['#1d4ed8', 'var(--acento-fuerte)'],
  ['#bfdbfe', 'var(--acento-anillo)'],
  ['#eff6ff', 'var(--acento-suave)']
]);

const sinFuentes = readFileSync(ORIGEN, 'utf8').replace(/@font-face\s*\{[^}]*\}\s*/g, '');

const lineas = sinFuentes.split('\n').map(linea => {
  // Las definiciones de la paleta (--blue-500, --primary-500...) se dejan como están.
  if (linea.trim().startsWith('--')) return linea;
  return linea
    .replace(/#[0-9a-f]{6}\b/gi, color => COLORES.get(color.toLowerCase()) ?? color)
    .replace(/rgba\(59,\s*130,\s*246,\s*([0-9.]+)\)/g, (_, alfa) =>
      `color-mix(in srgb, var(--acento) ${Math.round(Number(alfa) * 100)}%, transparent)`);
});

mkdirSync('src/theme', { recursive: true });
writeFileSync(
  DESTINO,
  `/* Generado por scripts/generar-tema.mjs a partir del tema Lara de PrimeNG. No editar a mano. */\n${lineas.join('\n')}`
);

console.log(`${DESTINO}: ${lineas.length} líneas`);

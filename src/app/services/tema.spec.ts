import { describe, it, expect } from 'vitest';
import { ACENTO_POR_DEFECTO, contrasteConBlanco, paletaDeAcento } from './tema';

describe('paletaDeAcento', () => {
  // Los colores reales de las empresas: varios son demasiado claros para texto blanco.
  const colores = ['#e87646', '#10b9a0', '#4249d4', '#1e40af', '#2563eb', '#ffffff', '#ffff00'];

  it('el acento siempre se lee con texto blanco, sea cual sea el color de la empresa', () => {
    for (const color of colores) {
      expect(contrasteConBlanco(paletaDeAcento(color)['--acento'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('un color que ya se lee bien no cambia', () => {
    expect(paletaDeAcento('#1e40af')['--acento']).toBe('#1e40af');
  });

  it('un color claro se oscurece sin perder su tono', () => {
    const acento = paletaDeAcento('#10b9a0')['--acento'];
    expect(acento).not.toBe('#10b9a0');
    const [r, g, b] = [1, 3, 5].map(i => parseInt(acento.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('sin color válido usa el de la app', () => {
    const porDefecto = paletaDeAcento(ACENTO_POR_DEFECTO)['--acento'];
    expect(paletaDeAcento(null)['--acento']).toBe(porDefecto);
    expect(paletaDeAcento('')['--acento']).toBe(porDefecto);
    expect(paletaDeAcento('azul')['--acento']).toBe(porDefecto);
  });

  it('entiende el formato corto y sin numeral', () => {
    expect(paletaDeAcento('#123')['--acento']).toBe('#112233');
    expect(paletaDeAcento('1e40af')['--acento']).toBe('#1e40af');
  });

  it('también llena las variables que usa PrimeNG', () => {
    const paleta = paletaDeAcento('#1e40af');
    expect(paleta['--primary-color']).toBe(paleta['--acento']);
    expect(paleta['--p-primary-color']).toBe(paleta['--acento']);
  });
});

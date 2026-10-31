/** Lo que el servidor rechaza por una regla ya viene en español; lo demás es de conexión. */
export function mensajeDe(error: any, respaldo: string): string {
  return ['22023', 'P0001', '42501'].includes(error?.code) && error?.message ? error.message : respaldo;
}

// Un solo lugar para decidir si corremos en producción: evita que CORS,
// cookies y SQL se comporten distinto segun dónde se lea NODE_ENV.
const NON_PRODUCTION = new Set(['development', 'dev', 'test']);

// Seguro por defecto: si NODE_ENV no está definido o es desconocido,
// el sistema se comporta como producción.
export function isProduction(): boolean {
  const value = (process.env.NODE_ENV ?? '').trim().toLowerCase();
  return !NON_PRODUCTION.has(value);
}

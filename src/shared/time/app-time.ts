// Zona horaria unica de la app (uso local en Argentina). Cambiarla aca la cambia en todo el sistema.
export const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

// Fecha de hoy (AAAA-MM-DD) segun la zona de la app, sin depender de la zona del servidor.
export const todayInAppZone = (now: Date = new Date()): string => {
  const parts: Intl.DateTimeFormatPart[] = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const pick = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};
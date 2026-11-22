// EVITAR QUE CORS, COOIES Y SQL SE COMPORTEN DISTINTOS SEGUN DONDE SE LEA NODE_ENV
const NON_PRODUCTION: Set<string> = new Set(['development', 'dev', 'test']);

// DEFINO FUNCION PARA SABER SI NODE_ENV NO ESTA DEFINIDO O ES DESCONOCIDO EL SISTEMA SE COMPORTE COMO PRODUCCION
export const isProduction = (): boolean => {
  const value:string = (process.env.NODE_ENV ?? '').trim().toLowerCase();

  return !NON_PRODUCTION.has(value); //LO NIEGO PORQUE LA FUNCION EVALUA SI ESTA EN PRODUCCION
}

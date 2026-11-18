import { TRASH_RETENTION_DAYS } from "./journey.constants.js"


interface IQueryable {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>
}

export interface IJourneyTombstone {
  journeyDate: string
  createdAt: Date
  deletedAt: Date
  deleteReason: string
}

// BUENA PRACTICA PARA ERRORES A MANO DE ESCRITURA EN EL PROYECTO
enum EJourneyTombstones {
  NAME_TABLE = 'journey_tombstones',
  ALIAS = 't'
}

enum EJourneyHistory {
  NAME_TABLE = 'journey_history',
  ALIAS = 'jh'
}

enum ECommonColumn {
  VERIFICATION_CODE = 'verification_code',
  JOURNEY_DATE = 'journey_date',
  CREATE_AT = 'created_at',
  DELETE_AT = 'deleted_at',
  DELETE_REASON = 'delete_reason'
}


// ARCHIVA LAS JORNADAS DE PAPELERA CON MAS DE 30 DIAS, REPETIRLO NO DUPLICA NADA.
export const archiveExpiredTrash = async (db: IQueryable) => {
  // CREO LA CONSULTA STRING
  const queryStr: string = `
            INSERT INTO ${EJourneyTombstones.NAME_TABLE} (${ECommonColumn.VERIFICATION_CODE}, ${ECommonColumn.JOURNEY_DATE}, ${ECommonColumn.CREATE_AT}, ${ECommonColumn.DELETE_AT}, ${ECommonColumn.DELETE_REASON})
            SELECT ${EJourneyHistory.ALIAS}.${ECommonColumn.VERIFICATION_CODE}, ${EJourneyHistory.ALIAS}.${ECommonColumn.JOURNEY_DATE}, ${EJourneyHistory.ALIAS}.${ECommonColumn.CREATE_AT}, ${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT}, COALESCE(${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_REASON}, 'user')
            FROM ${EJourneyHistory.NAME_TABLE} AS ${EJourneyHistory.ALIAS}
            WHERE ${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT} IS NOT NULL AND ${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT} < NOW() - INTERVAL ? DAY
            ON DUPLICATE KEY UPDATE ${EJourneyTombstones.NAME_TABLE}.${ECommonColumn.VERIFICATION_CODE} = ${EJourneyTombstones.NAME_TABLE}.${ECommonColumn.VERIFICATION_CODE}
        `;

  // EJECUTO LA FUNCION PASANDO LA QUERY
  await db.query(queryStr, [TRASH_RETENTION_DAYS]);
}

// Borra solo lo vencido que ya tiene registro permanente (los vales caen por CASCADE).
export const deleteArchivedExpiredTrash = async (db: IQueryable): Promise<number> => {
  const result = (await db.query(
    `DELETE ${EJourneyHistory.ALIAS} FROM ${EJourneyHistory.NAME_TABLE} AS ${EJourneyHistory.ALIAS}
     INNER JOIN ${EJourneyTombstones.NAME_TABLE} AS ${EJourneyTombstones.ALIAS} ON ${EJourneyTombstones.ALIAS}.${ECommonColumn.VERIFICATION_CODE} = ${EJourneyHistory.ALIAS}.${ECommonColumn.VERIFICATION_CODE}
     WHERE ${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT} IS NOT NULL AND ${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT} < NOW() - INTERVAL ? DAY`,
    [TRASH_RETENTION_DAYS],
  )) as { affectedRows?: number };
  return result.affectedRows ?? 0;
};

// Archiva TODAS las jornadas de un usuario antes de purgar su cuenta.
export const archiveUserJourneys = async (db: IQueryable, userId: string): Promise<void> => {
  await db.query(
    `INSERT INTO ${EJourneyTombstones.NAME_TABLE} (${ECommonColumn.VERIFICATION_CODE}, ${ECommonColumn.JOURNEY_DATE}, ${ECommonColumn.CREATE_AT}, ${ECommonColumn.DELETE_AT}, ${ECommonColumn.DELETE_REASON})
     SELECT ${EJourneyHistory.ALIAS}.${ECommonColumn.VERIFICATION_CODE}, ${EJourneyHistory.ALIAS}.${ECommonColumn.JOURNEY_DATE}, ${EJourneyHistory.ALIAS}.${ECommonColumn.CREATE_AT}, COALESCE(${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_AT}, NOW()), COALESCE(${EJourneyHistory.ALIAS}.${ECommonColumn.DELETE_REASON}, 'account')
     FROM ${EJourneyHistory.NAME_TABLE} ${EJourneyHistory.ALIAS}
     WHERE ${EJourneyHistory.ALIAS}.user_id = ?
     ON DUPLICATE KEY UPDATE ${EJourneyTombstones.NAME_TABLE}.${ECommonColumn.VERIFICATION_CODE} = ${EJourneyTombstones.NAME_TABLE}.${ECommonColumn.VERIFICATION_CODE}`,
    [userId],
  );
};

export const findTombstone = async (db: IQueryable, code: string): Promise<IJourneyTombstone | null> => {
  const rows = (await db.query(
    `SELECT DATE_FORMAT(${ECommonColumn.JOURNEY_DATE}, '%Y-%m-%d') AS journeyDate, ${ECommonColumn.CREATE_AT} AS createdAt,
            ${ECommonColumn.DELETE_AT} AS deletedAt, ${ECommonColumn.DELETE_REASON} AS deleteReason
     FROM ${EJourneyTombstones.NAME_TABLE} WHERE ${ECommonColumn.VERIFICATION_CODE} = ? LIMIT 1`,
    [code],
  )) as IJourneyTombstone[];
  return rows[0] ?? null;
};

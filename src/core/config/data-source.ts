import { DataSource, DataSourceOptions } from 'typeorm';
import { config as loadDotenv } from 'dotenv';
import { UserEntity } from '../../shared/entities/user.entity.js';
import { ConversationEntity } from '../../shared/entities/conversation.entity.js';
import { ConversationMessageEntity } from '../../shared/entities/conversation-message.entity.js';
import { UserDailyUsageEntity } from '../../shared/entities/user-daily-usage.entity.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ConversationMessageImageEntity } from '../../shared/entities/conversation-message-image.entity.js';
import { ConversationCalculationEntity } from '../../shared/entities/conversation-calculation.entity.js';
import { UserSettingsEntity } from '../../shared/entities/user-setting.entity.js';
import { JourneyHistoryEntity } from '../../shared/entities/journey-history.entity.js';
import { JourneyHistoryVoucherEntity } from '../../shared/entities/journey-history-voucher.entity.js';
import { JourneyDraftEntity } from '../../shared/entities/journey-draft.entity.js';
import { JourneyTombstoneEntity } from '../../shared/entities/journey-tombstone.entity.js';
import { RefreshTokenEntity } from '../../shared/entities/refresh-token.entity.js';
const __filename = fileURLToPath(import.meta.url); // CONVERTIR A URL "/"
const __dirname = dirname(__filename) //SOLO QUIERO LA RUTA COMPLETA SIN ARCHIVO
// Cargo las variables de entorno para que el CLI de typeorm y el runtime
// compartan la misma configuracion de conexion a MySQL.
loadDotenv({ quiet: true });

// Este es el datasource compartido (solo lectura de env; nunca valores hardcoded).
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'lqc_db',
  entities: [
    UserEntity,
    ConversationEntity,
    ConversationMessageEntity,
    UserDailyUsageEntity,
    ConversationMessageImageEntity,
    ConversationCalculationEntity,
    RefreshTokenEntity,
    JourneyHistoryEntity,
    JourneyHistoryVoucherEntity,
    JourneyDraftEntity,
    UserSettingsEntity,
    JourneyTombstoneEntity
  ],
  // La app compila a .js y el CLI corre sobre .ts: acepto ambos formatos.
  migrations: [join(__dirname, '../../migrations/*.{js,ts}')],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  extra: {
    // Configure pool seguro para Railway/MySQL segun AGENTS.md §10.
    connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 10),
  },
  // Las consultas de la app son parametrizadas; no hace falta permitir
  // multiples sentencias por query (defensa ante inyeccion SQL).
  multipleStatements: false
};

// Exporto la instancia para los comandos de migracion (typeorm CLI).
export const AppDataSource = new DataSource(dataSourceOptions);

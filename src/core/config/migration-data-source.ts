import { DataSource, type DataSourceOptions } from 'typeorm';
import { dataSourceOptions } from './data-source.js';

// El CLI de migraciones ejecuta archivos SQL completos (varias sentencias por
// archivo), algo que el datasource de la app tiene desactivado a propósito.
export const MigrationDataSource = new DataSource({
  ...dataSourceOptions,
  multipleStatements: true,
} as DataSourceOptions);

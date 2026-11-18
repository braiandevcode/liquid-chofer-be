import type { MigrationInterface, QueryRunner } from "typeorm";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url); // CONVERTIR A URL "/"
const __dirname = dirname(__filename) //SOLO QUIERO LA RUTA COMPLETA SIN ARCHIVO

export class InitSchema1793888296391 implements MigrationInterface {

    public async up(q: QueryRunner): Promise<void> {
        const sql = readFileSync(join(__dirname, '../../database/schema.sql'), 'utf8')
        await q.query(sql)
    }

    public async down(q: QueryRunner): Promise<void> {
        const sql = readFileSync(join(__dirname, '../../database/drop-schema.sql'), 'utf8')
        await q.query(sql)
    }
}

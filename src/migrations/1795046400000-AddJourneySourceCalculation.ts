import type { MigrationInterface, QueryRunner } from "typeorm";

// Agrega solo el vinculo calculation -> jornada; el resto del esquema queda intacto.
export class AddJourneySourceCalculation1795046400000 implements MigrationInterface {
    public async up(q: QueryRunner): Promise<void> {
        const columns: { count: number }[] = await q.query(
            `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'journey_history'
               AND COLUMN_NAME = 'source_calculation_id'`,
        );
        if (Number(columns[0]?.count ?? 0) === 0) {
            await q.query(
                'ALTER TABLE `journey_history` ADD COLUMN `source_calculation_id` VARCHAR(36) NULL DEFAULT NULL AFTER `replaced_by_id`',
            );
        }
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query('ALTER TABLE `journey_history` DROP COLUMN `source_calculation_id`');
    }
}

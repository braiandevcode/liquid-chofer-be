import {
    ConflictException,
    HttpException,
    HttpStatus,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, QueryFailedError, Repository } from 'typeorm';
import { JourneyHistoryEntity } from '../../shared/entities/journey-history.entity.js';
import { JourneyHistoryVoucherEntity } from '../../shared/entities/journey-history-voucher.entity.js';
import { calculateJourney, IJourneyCalcResult } from './journey-calculator.js';
import { CreateJourneyDto } from './dto/create-journey.dto.js';
import { type TCarOwner } from './type/TCarOwner.js';
import { todayInAppZone } from '../../shared/time/app-time.js';
import { TRASH_RETENTION_MS } from './journey.constants.js';
import { formatVerificationCode, generateVerificationCode, normalizeVerificationCode } from './journey-verification-code.js';
import { JourneyTombstoneEntity } from '../../shared/entities/journey-tombstone.entity.js';

// TOPE DE JORNADAS VIGENTES POR USUARIO.
const MAX_JOURNEYS_PER_USER: number = 500;
// Cuento vigentes + papelera por usuario y fecha para frenar el ciclo crear/eliminar de un mismo día.
const MAX_STORED_JOURNEYS_PER_USER_PER_DATE: number = 3;
@Injectable()
export class JourneysService {
    private readonly logger = new Logger(JourneysService.name);

    constructor(
        @InjectRepository(JourneyHistoryEntity)
        private readonly journeyRepository: Repository<JourneyHistoryEntity>,
        @InjectRepository(JourneyTombstoneEntity) 
        private readonly tombstoneRepository: Repository<JourneyTombstoneEntity>,
        private readonly dataSource: DataSource,
    ) { }

    // Valida, calcula en el servidor y guarda jornada + vales en una transaccion.
    async create(userId: string, dto: CreateJourneyDto) {
        this.assertRealDate(dto.journeyDate);

        const carPercent: number | null = dto.carRented ? (dto.carPercent ?? null) : null;

        // ALQUILADO => SIN DUEÑO; NO ALQUILADO => DUEÑO ENVIADO O AGENCIA
        const carOwner: TCarOwner | null = dto.carRented ? null : (dto.carOwner ?? 'agency');

        if (dto.carRented && carPercent === null) {
            throw new UnprocessableEntityException('Indicá el % del vehículo alquilado.');
        }
        const percentTotal: number = dto.agencyPercent + dto.driverPercent + (carPercent ?? 0);

        if (percentTotal !== 100) {
            throw new UnprocessableEntityException(
                `Los porcentajes deben sumar 100 (suman ${percentTotal}).`,
            );
        }

        const result: IJourneyCalcResult = calculateJourney({
            total: dto.total,
            agencyPercent: dto.agencyPercent,
            driverPercent: dto.driverPercent,
            carRented: dto.carRented,
            carPercent,
            carOwner,
            gas: dto.gas,
            petrol: dto.petrol,
            vouchers: dto.vouchers,
        });

        try {
            return await this.dataSource.transaction(async (manager) => {
                // Jornada vigente de esa fecha (TypeORM excluye las de papelera por defecto).
                const existing: JourneyHistoryEntity | null = await manager.findOne(JourneyHistoryEntity, {
                    where: { userId, journeyDate: dto.journeyDate },
                });

                if (existing && !dto.replaceExisting) {
                    throw new ConflictException({
                        statusCode: HttpStatus.CONFLICT,
                        code: 'JOURNEY_DATE_EXISTS',
                        message: 'Ya tenés una jornada guardada con esa fecha.',
                        existing: {
                            id: existing.id,
                            journeyDate: existing.journeyDate,
                            total: existing.total,
                            createdAt: existing.createdAt,
                        },
                    });
                }

                // Reemplazo confirmado: la anterior pasa a papelera ANTES de guardar la nueva (libera el indice unico).
                if (existing) {
                    await manager.update(JourneyHistoryEntity, { id: existing.id }, {
                        deletedAt: new Date(),
                        activeSlot: null,
                        deleteReason: 'replaced',
                    });
                }

                // Cuenta solo las vigentes; si falla aca, la transaccion revierte tambien el reemplazo.
                const count: number = await manager.count(JourneyHistoryEntity, { where: { userId } });
                if (count >= MAX_JOURNEYS_PER_USER) {
                    throw new ConflictException(
                        `Alcanzaste el máximo de ${MAX_JOURNEYS_PER_USER} jornadas guardadas. Eliminá alguna para continuar.`,
                    );
                }

                // Cuento las guardadas para esta fecha, incluidas las de papelera.
                const totalForDate: number = await manager.count(JourneyHistoryEntity, {
                    where: { userId, journeyDate: dto.journeyDate },
                    withDeleted: true,
                });

                // Si llegué al tope de esa fecha, no agrego otra fila.
                if (totalForDate >= MAX_STORED_JOURNEYS_PER_USER_PER_DATE) {
                    throw new ConflictException(
                        'Alcanzaste el máximo de jornadas para esa fecha, incluida la papelera. Probá de nuevo cuando se purguen las eliminadas más antiguas.',
                    );
                }

                // SINO GUARDAMOS
                const journey: JourneyHistoryEntity = await manager.save(
                    manager.create(JourneyHistoryEntity, {
                        userId,
                        journeyDate: dto.journeyDate,
                        total: dto.total,
                        agencyPercent: dto.agencyPercent,
                        driverPercent: dto.driverPercent,
                        carRented: dto.carRented,
                        carPercent,
                        carOwner,
                        gas: dto.gas,
                        petrol: dto.petrol,
                        activeSlot: 1,
                        verificationCode: generateVerificationCode(),
                        ...result,
                    }),
                );

                const vouchers = dto.vouchers.map((voucher, position) =>
                    manager.create(JourneyHistoryVoucherEntity, {
                        journeyId: journey.id,
                        type: voucher.type,
                        name: voucher.name,
                        trips: voucher.trips,
                        pricePerTrip: voucher.pricePerTrip,
                        // Solo los vales de fabrica llevan fijo (igual que calculateResult).
                        fixedFeePerTrip: voucher.type === 'factory' ? voucher.fixedFeePerTrip : 0,
                        position,
                    }),
                );
                if (vouchers.length > 0) await manager.save(vouchers);

                // Trazabilidad: la anterior queda apuntando a la jornada que la reemplazo.
                if (existing) {
                    await manager.update(JourneyHistoryEntity, { id: existing.id }, { replacedById: journey.id });
                }

                return { ...journey, vouchers };
            });
        } catch (error) {
            // Dos guardados simultaneos de la misma fecha: el indice unico deja pasar solo uno.
            if (this.isDuplicateEntry(error)) {
                throw new ConflictException({
                    statusCode: HttpStatus.CONFLICT,
                    code: 'JOURNEY_DATE_EXISTS',
                    message: 'Ya tenés una jornada guardada con esa fecha.',
                });
            }
            this.rethrowOrWrap(error, 'No se pudo guardar la jornada.');
        }
    }

    // LISTAR PAPELERA DEL USUARIO
    async listTrash(userId: string, limit = 50, offset = 0) {
        try {
            const [rows, total] = await this.journeyRepository.findAndCount({
                where: { userId, deletedAt: Not(IsNull()) },
                withDeleted: true,
                order: { deletedAt: 'DESC' },
                take: limit,
                skip: offset
            })

            const items = rows.map(row => ({
                id: row.id,
                journeyDate: row.journeyDate,
                total: row.total,
                createdAt: row.createdAt,
                deletedAt: row.deletedAt,
                deleteReason: row.deleteReason,
                replacedById: row.replacedById,
                // Fecha en que se borra definitivamente.
                purgeAt: row.deletedAt ? new Date(row.deletedAt.getTime() + TRASH_RETENTION_MS) : null,
            }))

            return { items, total, limit, offset };
        } catch (error) {
            return this.rethrowOrWrap(error, 'No se pudo cargar la papelera')
        }
    }


    private isDuplicateEntry(error: unknown): boolean {
        if (!(error instanceof QueryFailedError)) return false;
        const driverError = error.driverError as { code?: string; errno?: number };
        return driverError.code === 'ER_DUP_ENTRY' || driverError.errno === 1062;
    }

    // Lista paginada (sin vales), la mas reciente primero.
    async list(userId: string, limit = 50, offset = 0) {
        try {
            const [items, total] = await this.journeyRepository.findAndCount({
                where: { userId },
                order: { journeyDate: 'DESC', createdAt: 'DESC' },
                take: limit,
                skip: offset,
            });
            return { items, total, limit, offset };
        } catch (error) {
            this.rethrowOrWrap(error, 'No se pudo cargar el historial.');
        }
    }

    // DETALLES JORNADA (INCLUIDO VALES) SOLO SI EL USUARIO ES EL AUTENTICADO
    async getOne(userId: string, id: string) {
        try {
            const journey: JourneyHistoryEntity | null = await this.journeyRepository.findOne({
                where: { id, userId },
                relations: { vouchers: true },
                order: { vouchers: { position: 'ASC' } },
            });
            if (!journey) throw new NotFoundException('La jornada no existe.');
            return journey;
        } catch (error) {
            this.rethrowOrWrap(error, 'No se pudo cargar la jornada.');
        }
    }

    //FUNCION PARA RESTAURAR PAPELERA. SI HAY UNA VIGENTE EN LA MISMA FECHA, EXIGIR CONFIRMAR EL REEMPLAZO
    async restore(userId: string, id: string, replaceExisting: boolean) {
        try {
            return await this.dataSource.transaction(async (manager) => {
                // BUSCAR UNA JORNADA QUE CUMPLA CON EL ID DE JORNADA + ID DE USUARIO AUTENTICADO + CAMPO DE BORRADO CON VALOR
                const trashed = await manager.findOne(JourneyHistoryEntity, {
                    where: { id, userId },
                    withDeleted: true,
                });

                // INEXISTENTE, AJENA, YA VIGENTE O VENCIDA: MISMA RESPUESTA
                if (!trashed?.deletedAt || Date.now() - trashed.deletedAt.getTime() > TRASH_RETENTION_MS) {
                    throw new NotFoundException('La jornada no está en la papelera.');
                }

                // VIGENTE DEL DIA
                const existing: JourneyHistoryEntity | null = await manager.findOne(JourneyHistoryEntity, {
                    where: { userId, journeyDate: trashed.journeyDate },
                });

                // SI ESTA ESTA VIGENTECON MISMA FECHA Y EL REEMPLAZO ES FALSE
                if (existing && !replaceExisting) {
                    throw new ConflictException({
                        statusCode: HttpStatus.CONFLICT,
                        code: 'JOURNEY_DATE_EXISTS',
                        message: 'Ya tenés una jornada vigente con esa fecha.',
                        existing: {
                            id: existing.id,
                            journeyDate: existing.journeyDate,
                            total: existing.total,
                            createdAt: existing.createdAt,
                        },
                    });
                }

                // SI EXISTE UNA VIGENTE -> LA VIGENTE PASA A PAPELERA (libera el indice unico)
                if (existing) {
                    // ACTUALIZAR
                    await manager.update(JourneyHistoryEntity, { id: existing.id }, {
                        deletedAt: new Date(),
                        activeSlot: null,
                        deleteReason: 'replaced',
                        replacedById: trashed.id,
                    });
                }

                // CONTAR LAS JORNADAS ACTIVAS
                const active: number = await manager.count(JourneyHistoryEntity, { where: { userId } });

                // SI SON MAYOR AL LIMITE ESTABLECIDO
                if (active >= MAX_JOURNEYS_PER_USER) {
                    throw new ConflictException(
                        `Alcanzaste el máximo de ${MAX_JOURNEYS_PER_USER} jornadas guardadas. Eliminá alguna para continuar.`,
                    );
                }

                // COMPLETAR RESTAURACION
                await manager.restore(JourneyHistoryEntity, { id: trashed.id });

                // VOLVER A JORNADA VIGENTE
                await manager.update(JourneyHistoryEntity, { id: trashed.id }, {
                    activeSlot: 1,
                    deleteReason: null,
                    replacedById: null,
                });

                // MENSAJE AL FRONTEND
                return { message: 'Jornada restaurada.', id: trashed.id };
            });
        } catch (error) {
            // CHOQUE CON OTRO GUARDADO SIMULTANEO DE LA MISMA FECHA
            if (this.isDuplicateEntry(error)) {
                throw new ConflictException({
                    statusCode: HttpStatus.CONFLICT,
                    code: 'JOURNEY_DATE_EXISTS',
                    message: 'Ya tenés una jornada vigente con esa fecha.',
                });
            }
            this.rethrowOrWrap(error, 'No se pudo restaurar la jornada.');
        }
    }

    // Una jornada puede descargarse/compartirse solo si existe, es del usuario y esta vigente.
    async getShareStatus(userId: string, id: string) {
        try {
            const journey: JourneyHistoryEntity | null = await this.journeyRepository.findOne({
                where: { id, userId },
                relations: { vouchers: true },
                order: { vouchers: { position: 'ASC' } },
                withDeleted: true,
            });

            // SI NO EXISTE O NO ES DEL USUARIO
            if (!journey) throw new NotFoundException('La jornada no existe.');

            // En papelera: se informa el estado, sin devolver sus datos.

            // DEVOLVER A PAPELERA SOLO EL ESTADO
            if (journey.deletedAt) return { shareable: false, status: 'deleted' as const };

            return {
                shareable: true,
                status: 'active' as const,
                verificationCode: formatVerificationCode(journey.verificationCode),
                journey,
            };
        } catch (error) {
            this.rethrowOrWrap(error, 'No se pudo verificar la jornada.');
        }
    }

    // Verificacion publica: estado de la constancia y, mientras el registro exista, sus importes.

    // VERIFICACION PUBLICA: ESTADO DE LA CONSTANCIA Y, MIENTRAS EL RESGISTRO EXISTA, SUS IMPORTES
    async verify(rawCode: string) {
        const code: string | null = normalizeVerificationCode(rawCode);
        // Mal formado o inexistente: misma respuesta.
        if (!code) throw new NotFoundException('La constancia no existe.');

        try {
            const journey = await this.journeyRepository.findOne({
                where: { verificationCode: code },
                withDeleted: true,
            });

            if (journey) {
                const status = !journey.deletedAt
                    ? 'active'
                    : journey.deleteReason === 'replaced'
                        ? 'replaced'
                        : 'deleted';
                return {
                    status,
                    journeyDate: journey.journeyDate,
                    createdAt: journey.createdAt,
                    deletedAt: journey.deletedAt,
                    amounts: {
                        total: journey.total,
                        adjustedTotal: journey.adjustedTotal,
                        agencyPercent: journey.agencyPercent,
                        agencyAmount: journey.agencyAmount,
                        finalAgency: journey.finalAgency,
                        driverPercent: journey.driverPercent,
                        driverAmount: journey.driverAmount,
                        carPercent: journey.carPercent,
                        carAmount: journey.carAmount,
                    },
                };
            }

           const tombstone = await this.tombstoneRepository.findOne({ where: { verificationCode: code } });
            if (!tombstone) throw new NotFoundException('La constancia no existe.');

            return {
                status: tombstone.deleteReason === 'replaced' ? ('replaced' as const) : ('deleted' as const),
                journeyDate: tombstone.journeyDate,
                createdAt: tombstone.createdAt,
                deletedAt: tombstone.deletedAt,
                amounts: null,
            };
        } catch (error) {
            this.rethrowOrWrap(error, 'No se pudo verificar la constancia.');
        }
    }


    // BORRADO LOGICO (SE CONSERVA 30 DIAS EN PAPELERA) Y LIBERO EL DIA PARA OTRA JORNADA
    async remove(userId: string, id: string) {
        try {
            const result = await this.journeyRepository.update(
                { id, userId, deletedAt: IsNull() },
                { deletedAt: new Date(), activeSlot: null, deleteReason: 'user' }
            );

            if (!result.affected) throw new NotFoundException('La jornada no existe')

            return { message: 'Jornada eliminada.' }
        } catch (error) {
            this.rethrowOrWrap(error, 'No se pudo eliminar la jornada.')
        }
    }

    // Rechaza fechas inexistentes (2026-02-31) y fechas futuras (segun la zona de la app).
    private assertRealDate(value: string): void {
        const [y, m, d] = value.split('-').map(Number);
        const date: Date = new Date(Date.UTC(y, m - 1, d));
        const isReal: boolean =
            date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;

        if (!isReal) throw new UnprocessableEntityException('La fecha no es válida.');

        // AAAA-MM-DD con ceros ordena igual como texto que como fecha.
        if (value > todayInAppZone()) {
            throw new UnprocessableEntityException('La fecha no puede ser futura.');
        }
    }

    // Conserva errores HTTP conocidos y convierte el resto en 500.
    private rethrowOrWrap(error: unknown, message: string): never {
        if (error instanceof HttpException) throw error;
        this.logger.error(message, error instanceof Error ? error.stack : String(error));
        throw new InternalServerErrorException(message);
    }
}
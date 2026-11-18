import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JourneyDraftEntity } from '../../shared/entities/journey-draft.entity.js';
import { SaveDraftDto } from './dto/save-draft.dto.js';

@Injectable()
export class JourneyDraftService {
  private readonly logger = new Logger(JourneyDraftService.name);

  constructor(
    @InjectRepository(JourneyDraftEntity)
    private readonly draftRepository: Repository<JourneyDraftEntity>,
  ) {}

  // Devuelve el borrador del usuario o null si no tiene.
  async get(userId: string): Promise<{ data: Record<string, unknown> | null }> {
    try {
      const found = await this.draftRepository.findOne({ where: { userId } });
      return { data: found?.data ?? null };
    } catch (error) {
      this.fail('Error al cargar el borrador', error, 'No se pudo cargar el borrador.');
    }
  }

  // Crea o reemplaza el borrador (PK = user_id).
  async save(userId: string, dto: SaveDraftDto): Promise<{ message: string }> {
    try {
      await this.draftRepository.save(
        this.draftRepository.create({ userId, data: { ...dto } }),
      );
      return { message: 'Borrador guardado.' };
    } catch (error) {
      this.fail('Error al guardar el borrador', error, 'No se pudo guardar el borrador.');
    }
  }

  // Borra el borrador del usuario (si no existe, no pasa nada).
  async remove(userId: string): Promise<{ message: string }> {
    try {
      await this.draftRepository.delete({ userId });
      return { message: 'Borrador eliminado.' };
    } catch (error) {
      this.fail('Error al eliminar el borrador', error, 'No se pudo eliminar el borrador.');
    }
  }

  private fail(log: string, error: unknown, message: string): never {
    this.logger.error(log, error instanceof Error ? error.stack : String(error));
    throw new InternalServerErrorException(message);
  }
}
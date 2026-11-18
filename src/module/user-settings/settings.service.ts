import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateSettingsDto } from './dto/update-setting.dto.js';
import { UserSettingsEntity } from '../../shared/entities/user-setting.entity.js';
import { TCarOwner } from '../journeys/type/TCarOwner.js';


// Contrato que se devuelve al frontend.
export interface ISettingsProfile {
  defaultAgencyPercent: number;
  defaultDriverPercent: number;
  defaultCarRented: boolean;
  defaultCarPercent: number | null;
  defaultCarOwner: TCarOwner | null;
}

// Valores usados cuando el usuario aun no guardo ajustes (igual que initialState del frontend).
const DEFAULT_SETTINGS: ISettingsProfile = {
  defaultAgencyPercent: 70,
  defaultDriverPercent: 30,
  defaultCarRented: false,
  defaultCarPercent: null,
  defaultCarOwner: 'agency',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly settingsRepository: Repository<UserSettingsEntity>,
  ) {}

  // Devuelve los ajustes del usuario o los valores por defecto si aun no guardo.
  async get(userId: string): Promise<ISettingsProfile> {
    try {
      const found = await this.settingsRepository.findOne({ where: { userId } });
      return found ? this.toProfile(found) : { ...DEFAULT_SETTINGS };
    } catch (error) {
      this.logger.error('Error al cargar los ajustes', this.errorStack(error));
      throw new InternalServerErrorException('No se pudieron cargar los ajustes.');
    }
  }

  // Valida la suma a 100 y guarda (crea la fila si no existe).
  async update(userId: string, dto: UpdateSettingsDto): Promise<ISettingsProfile> {
    const carPercent: number | null = dto.defaultCarRented ? (dto.defaultCarPercent ?? null) : null;

    if (dto.defaultCarRented && carPercent === null) {
      throw new UnprocessableEntityException('Indicá el % del vehículo alquilado.');
    }

    const total: number =
      dto.defaultAgencyPercent + dto.defaultDriverPercent + (carPercent ?? 0);
    if (total !== 100) {
      throw new UnprocessableEntityException(
        `Los porcentajes deben sumar 100 (suman ${total}).`,
      );
    }

    try {
      const saved = await this.settingsRepository.save(
        this.settingsRepository.create({
          userId,
          defaultAgencyPercent: dto.defaultAgencyPercent,
          defaultDriverPercent: dto.defaultDriverPercent,
          defaultCarRented: dto.defaultCarRented,
          defaultCarPercent: carPercent,
          defaultCarOwner: dto.defaultCarRented ? null : (dto.defaultCarOwner ?? 'agency'),
        }),
      );
      return this.toProfile(saved);
    } catch (error) {
      this.logger.error('Error al guardar los ajustes', this.errorStack(error));
      throw new InternalServerErrorException('No se pudieron guardar los ajustes.');
    }
  }

  private toProfile(entity: UserSettingsEntity): ISettingsProfile {
    return {
      defaultAgencyPercent: entity.defaultAgencyPercent,
      defaultDriverPercent: entity.defaultDriverPercent,
      defaultCarRented: entity.defaultCarRented,
      defaultCarPercent: entity.defaultCarPercent,
      defaultCarOwner: entity.defaultCarOwner,
    };
  }

  private errorStack(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message;
    return 'Error desconocido';
  }
}
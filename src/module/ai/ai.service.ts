import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository, LessThanOrEqual } from 'typeorm';
import { ERole, throwConversationNotFound } from '../../shared/ai/ai.constants.js';
import {
  EVoucherType,
  ICalculationInput,
  ICalculationResult,
  ICalculationState,
  ICalculationVoucher,
  TCalculationExtraction,
  TCalculationFieldKey,
  TCalculationStatus,
} from '../../shared/ai/calculation.types.js';
import { ConversationEntity } from '../../shared/entities/conversation.entity.js';
import { ConversationCalculationEntity } from '../../shared/entities/conversation-calculation.entity.js';
import { ConversationMessageEntity } from '../../shared/entities/conversation-message.entity.js';
import { ConversationMessageImageEntity } from '../../shared/entities/conversation-message-image.entity.js';
import { UserDailyUsageEntity } from '../../shared/entities/user-daily-usage.entity.js';
import { JourneyHistoryEntity } from '../../shared/entities/journey-history.entity.js';
import { IAuthUser } from '../../shared/types/auth.types.js';
import { OpenAIProvider, IChatMessage, ICalculationChatResult } from './ia.provider.js';
import { CloudinaryService } from './cloudinary.services.js';
import { CalculationService } from './calculation.service.js';
import {
  buildConversationImageFileName,
  buildConversationImageFolder,
  buildConversationImageTags,
  conversationFolderFromPublicId,
} from './conversation-image-path.js';

// Duracion de vida de cada conversacion (24 horas).
const CONVERSATION_TTL_MS: number = 24 * 60 * 60 * 1000;
// UN GASTO O LOS VALES AUSENTES SON "FALTANTES", NO "DUDOSOS"
const NEVER_UNCLEAR: readonly string[] = ['gas', 'fuel', 'vouchers'];

// Si 'percentages' es confuso, esa pregunta ya cubre a todos los porcentajes.
const PERCENTAGE_FIELDS: readonly string[] = [
  'agencyPercentage',
  'driverPercentage',
  'vehiclePercentage',
  'percentages',
];

// Etiquetas de los datos de cada vale, para pedir exactamente lo que falta.
const VOUCHER_FIELD_LABELS: Record<string, string> = {
  type: 'tipo (fábrica u otro)',
  name: 'nombre del cliente/entidad',
  trips: 'cantidad de viajes',
  pricePerTrip: 'precio real por viaje',
  fixedFeePerTrip: 'precio planilla por viaje',
};

const SAFE_REPLIES: readonly string[] = [
  'Eso no te lo puedo compartir, pero con gusto te sigo ayudando con la app o con el cierre de tu jornada.',
  'De eso no puedo hablar. Si querés, retomamos el cálculo o alguna duda de la app.',
  'Prefiero no entrar en eso. ¿Seguimos con los datos de tu jornada?',
  'Ahí no te puedo ayudar, pero con la calculadora o el cierre sí. ¿Qué necesitás?',
];

// Lo que un asistente de LiquidChofer nunca debe mostrar: nombres internos y codigo.
const BLOCKED_REPLY_PATTERNS: readonly RegExp[] = [
  /vehicleRented|vehiclePercentage|agencyPercentage|driverPercentage|totalInvoiced|unclearFields|extract_calculation|pricePerTrip|fixedFeePerTrip/i,
  /```|<script|\bprint\s*\(|\bconsole\.log\b|\bdef\s+\w+\s*\(|\bimport\s+\w+/i,
];

// ETIQUETAS DE LOS CAMPOS DE CALCULO PARA PEDIR DATOS FALTANTES AL USUARIO
const CALCULATION_FIELD_LABELS: Record<string, string> = {
  totalInvoiced: 'el total neto de la jornada',
  agencyPercentage: 'el % de agencia',
  driverPercentage: 'el % del conductor',
  vehicleRented: 'si el vehículo está alquilado (y si no lo está, de quién es: de la agencia o del conductor)',
  carOwner: 'de quién es el auto (de la agencia o del conductor)',
  vehiclePercentage: 'el % del vehículo',
  gas: 'el gasto de gas',
  fuel: 'el gasto de nafta',
  vouchers: 'si hubo vales (por cada uno: tipo, nombre, viajes, precio real y, en fábrica, precio planilla)',
  percentages: 'a qué corresponde cada porcentaje (agencia, chofer o vehículo)',
};

// Calculo listo para persistir junto al mensaje del asistente.
interface IPendingCalculation {
  status: TCalculationStatus;
  input: TCalculationExtraction;
  missingFields: string[];
  result?: ICalculationResult;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  // Limite diario gratuito de mensajes, sobreescribible por env.
  private readonly dailyLimit: number;
  // Usuarios cuya limpieza esta en curso (evita correrla dos veces en paralelo).
  private readonly cleaningUsers = new Set<string>();

  constructor(
    @InjectRepository(ConversationEntity)
    private readonly conversationRepository: Repository<ConversationEntity>,
    @InjectRepository(ConversationMessageEntity)
    private readonly messageRepository: Repository<ConversationMessageEntity>,
    @InjectRepository(ConversationMessageImageEntity)
    private readonly imageRepository: Repository<ConversationMessageImageEntity>,
    @InjectRepository(ConversationCalculationEntity)
    private readonly calculationRepository: Repository<ConversationCalculationEntity>,
    @InjectRepository(UserDailyUsageEntity)
    private readonly usageRepository: Repository<UserDailyUsageEntity>,
    @InjectRepository(JourneyHistoryEntity)
    private readonly journeyRepository: Repository<JourneyHistoryEntity>,
    private readonly ia: OpenAIProvider,
    private readonly cloudinary: CloudinaryService,
    private readonly calculations: CalculationService,
    configService: ConfigService,
  ) {
    this.dailyLimit = Number(configService.getOrThrow<string>('AI_DAILY_LIMIT') ?? 20);
  }

  // ENVIA UN MENSAJE A LA IA RESPETANDO EL LIMITE DIARIO TTL (24hs)
  async chat(
    user: IAuthUser,
    message: string | undefined,
    conversationId?: string,
    imagesData?: string[],
    confirmCalculation: boolean = false,
  ) {
    try {
      const TEXT: string = message ?? '';
      await this.enforceDailyLimit(user.id);

      // REUTILIZO LA CONVERSACION SI ES VALIDA Y NO EXPIRO, SINO CREO UNA NUEVA.
      const conversation: ConversationEntity = await this.resolveConversation(
        user.id,
        conversationId,
        TEXT,
      );

      const isNewConversation: boolean = conversation.id !== conversationId;

      const userMessage: ConversationMessageEntity = await this.saveMessage(
        conversation.id,
        ERole.USER,
        TEXT,
      );

      // ARMO EL HISTORIAL DE MENSAJES PARA ENVIARLO AL MODELO (TTL 24hs)
      const history: IChatMessage[] = await this.loadHistory(conversation.id);

      // SI HAY UN BORRADOR ACTIVO O UN CALCULO PREVIO, LO PASO AL MODELO PARA QUE PUEDA USARLO COMO CONTEXTO Y NO PEDIR DATOS QUE YA TIENE.
      // SINO , SI HAY UN CALCULO PREVIO COMPLETADO, LO PASO COMO CONTEXTO PARA QUE PUEDA CORREGIRLO O CONFIRMARLO.
      const activeDraft: ConversationCalculationEntity | null =
        (await this.getActiveCalculation(conversation.id)) ??
        (await this.getLatestCompletedCalculation(conversation.id));

      const draftContext: string | undefined = activeDraft
        ? this.buildDraftContext(activeDraft)
        : undefined;

      // VARIABLES QUE SE VAN A LLENAR CON LA RESPUESTA DEL MODELO Y EL ESTADO DEL CALCULO
      let iaReply: string;
      let extraction: TCalculationExtraction | null;
      let extractedUnclearFields: TCalculationFieldKey[];

      const isPureConfirm: boolean = confirmCalculation && !TEXT.trim() && !imagesData?.length;

      try {
        if (isPureConfirm) {
          // CONFIRMAR ES UN BOTON: NO CONSULTO AL MODELO, ASI NO PUEDE ALTERAR LOS DATOS
          iaReply = '';
          extraction = null;
          extractedUnclearFields = [];
        } else {
          const result: ICalculationChatResult = await this.ia.chatWithCalculation(history, imagesData, draftContext);
          iaReply = result.reply;
          extraction = result.extraction;
          extractedUnclearFields = result.unclearFields;
        }
      } catch (error) {
        this.logger.error('Error al consultar al ChofIA', this.errorStack(error));
        await this.discardFailedTurn(conversation, userMessage, isNewConversation);
        throw new ServiceUnavailableException(
          'El servicio de IA no está disponible. Intentá nuevamente.',
        );
      }

      // EL MODELO RESPONDIO: RECIEN AHORA GUARDO LAS IMAGENES Y SUS REFERENCIAS. SI FALLA, DESCARTO EL TURNO DEL USUARIO Y LA CONVERSACION SI ES NUEVA.
      let userImages: ConversationMessageImageEntity[] = [];
      try {
        if (imagesData?.length) {
          userImages = await this.saveMessageImages(user.id, conversation, userMessage, imagesData);
        }
      } catch (error) {
        await this.discardFailedTurn(conversation, userMessage, isNewConversation);
        throw error;
      }

      // ENTRO EN EL FLUJO DE CALCULO SI LA IA EXTRAE DATOS, 
      // MARCO DATOS CONFUSOS O SI EL FRONTEND CONFIRMA EXPLICITAMENTE. EL CALCULO SIEMPRE LO HACE EL BACKEND.
      const shouldCalculate: boolean =
        extraction !== null ||
        extractedUnclearFields.length > 0 ||
        confirmCalculation;

      let reply: string = this.guardReply(iaReply);
      let calculationState: ICalculationState | null = null;
      let draft: ConversationCalculationEntity | null = null;
      let pendingCalculation: IPendingCalculation | null = null;

      if (shouldCalculate) {
        draft = activeDraft;
        const base: Partial<ICalculationInput> = draft?.input ?? {};

        // LO DUDOSO DE ESTE TURNO SE DESCARTA, PERO NUNCA BORRA DATOS YA REGISTRADOS
        const turnData: TCalculationExtraction | null = extraction ? { ...extraction } : null;
        if (turnData) {
          for (const field of extractedUnclearFields) {
            if (field === 'percentages') {
              delete turnData.agencyPercentage;
              delete turnData.driverPercentage;
              delete turnData.vehiclePercentage;
              continue;
            }
            delete turnData[field];
          }
        }

        const input: Partial<ICalculationInput> = this.mergeCalculationInput(base, turnData);
        const effectiveInput: Partial<ICalculationInput> =
          this.calculations.withDerivedVehiclePercentage(input);
        const validationMissing: string[] = this.calculations.getMissingFields(effectiveInput);

        // UN DATO SOLO ES "DUDOSO" SI TODAVIA NO TENGO UN VALOR REGISTRADO PARA EL
        const hasBaseValue = (field: TCalculationFieldKey): boolean =>
          field === 'percentages'
            ? base.agencyPercentage !== undefined && base.driverPercentage !== undefined
            : base[field] !== undefined;

        const unclearFields: TCalculationFieldKey[] = extractedUnclearFields.filter(
          (field) =>
            !NEVER_UNCLEAR.includes(field) &&
            !hasBaseValue(field) &&
            !(field === 'vehiclePercentage' && effectiveInput.vehiclePercentage !== undefined),
        );
        const percentagesUnclear: boolean = unclearFields.includes('percentages');

        const missingFields: string[] = validationMissing.filter(
          (field) =>
            !unclearFields.includes(field as TCalculationFieldKey) &&
            !(percentagesUnclear && PERCENTAGE_FIELDS.includes(field)),
        );

        const percentagesMessage: string | undefined = missingFields.includes('percentages')
          ? this.describePercentageSum(effectiveInput)
          : undefined;

        const voucherDetail: string | undefined = missingFields.includes('vouchers')
          ? this.describeVoucherGaps(effectiveInput)
          : undefined;

        if (missingFields.length > 0 || unclearFields.length > 0) {
          pendingCalculation = {
            status: 'needs_data',
            input,
            missingFields: [...missingFields, ...unclearFields],
          };
        } else if (confirmCalculation) {
          const result = this.calculations.calculate(effectiveInput as ICalculationInput);
          pendingCalculation = {
            status: 'completed',
            input,
            missingFields: [],
            result,
          };
        } else {
          pendingCalculation = { status: 'offer', input, missingFields: [] };
        }

        // USO RESPUESTA DETERMINISTA PARA NO DEPENDER DE LA ARITMETICA DEL MODELO; 
        // LOS NUMEROS VIAJAN EN EL CAMPO ESTRUCTURADO.
        reply = this.buildCalculationReply(
          pendingCalculation.status,
          missingFields,
          unclearFields,
          percentagesMessage,
          voucherDetail,
        );

        const imageRead: string | undefined = imagesData?.length ? this.describeImageRead(turnData) : undefined;

        if (imageRead) reply = `${imageRead} ${reply}`;
      }

      const assistantMessage: ConversationMessageEntity = await this.saveMessage(
        conversation.id,
        ERole.ASSISTANT,
        reply,
      );

      // SI HAY UN CALCULO PENDIENTE, LO GUARDO JUNTO AL MENSAJE DEL ASISTENTE PARA QUE EL FRONTEND PUEDA MOSTRARLO.
      if (pendingCalculation) {
        const stored: ConversationCalculationEntity = await this.saveCalculation(
          conversation.id,
          assistantMessage.id,
          pendingCalculation,
          draft,
        );
        calculationState = await this.serializeCalculation(stored, user.id);
      }

      // REGISTRO EL CONSUMO DEL TURNO (USUARIO + ASISTENTE) PARA EL LIMITE DIARIO
      await this.incrementUsage(user.id);

      return {
        conversationId: conversation.id,
        reply,
        userMessage: this.serializeMessage(userMessage, userImages),
        assistantMessage: this.serializeMessage(assistantMessage, []),
        calculation: calculationState,
      };
    } catch (error) {
      this.handleUnexpectedError(error, 'chat');
    }
  }

  private guardReply(reply: string): string {
    return BLOCKED_REPLY_PATTERNS.some((pattern) => pattern.test(reply))
      ? SAFE_REPLIES[Math.floor(Math.random() * SAFE_REPLIES.length)]
      : reply;
  }

  // EXPLICA LA SUMA DE PORCENTAJES CON EL DETALLE DE CADA ROL, PARA PEDIR DATOS FALTANTES AL USUARIO.
  private describePercentageSum(input: Partial<ICalculationInput>): string {
    const parts: string[] = [];
    if (input.agencyPercentage !== undefined) parts.push(`agencia ${input.agencyPercentage}%`);
    if (input.driverPercentage !== undefined) parts.push(`chofer ${input.driverPercentage}%`);
    if (input.vehicleRented === true && input.vehiclePercentage !== undefined) {
      parts.push(`vehículo ${input.vehiclePercentage}%`);
    }

    const hasNegative: boolean = [
      input.agencyPercentage,
      input.driverPercentage,
      input.vehiclePercentage,
    ].some((value) => typeof value === 'number' && value < 0);

    if (hasNegative) {
      return `hay porcentajes negativos (${parts.join(', ')}) y no pueden serlo`;
    }

    const sum: number = this.calculations.getPercentageSum(input);
    return `los porcentajes suman ${sum}% (${parts.join(', ')}) y deben sumar 100%`;
  }


  // TRAS UNA IMAGEN, MUESTRO LO LEIDO PARA QUE EL USUARIO LO VERIFIQUE
  private describeImageRead(data: TCalculationExtraction | null): string | undefined {
    if (!data) return undefined;
    const parts: string[] = [];
    if (data.totalInvoiced !== undefined) parts.push(`total ${data.totalInvoiced.toLocaleString('es-AR')}`);
    if (data.agencyPercentage !== undefined) parts.push(`agencia ${data.agencyPercentage}%`);
    if (data.driverPercentage !== undefined) parts.push(`chofer ${data.driverPercentage}%`);
    if (data.vehiclePercentage !== undefined) parts.push(`vehículo ${data.vehiclePercentage}%`);
    return parts.length > 0
      ? `De la imagen leí: ${parts.join(', ')}. Si algo no coincide, corregilo por texto.`
      : undefined;
  }

  // Resume el borrador en lenguaje natural para el modelo (sin nombres de campos internos).
  private buildDraftContext(draft: ConversationCalculationEntity): string {
    const input: TCalculationExtraction = this.calculations.withDerivedVehiclePercentage(
      draft.input ?? {},
    );
    const missing: string[] = this.calculations.getMissingFields(input);
    const lines: string[] = [];

    const add = (label: string, value: number | boolean | undefined, suffix = ''): void => {
      if (value === undefined) return;
      const text: string = typeof value === 'boolean' ? (value ? 'sí' : 'no') : `${value}${suffix}`;
      lines.push(`- ${label}: ${text}`);
    };

    add('Total de la jornada', input.totalInvoiced);
    add('Porcentaje de agencia', input.agencyPercentage, '%');
    add('Porcentaje del conductor', input.driverPercentage, '%');
    add('Vehículo alquilado', input.vehicleRented);

    if (input.vehicleRented === false && input.carOwner) {
      lines.push(`- Dueño del auto: ${input.carOwner === 'driver' ? 'el conductor' : 'la agencia'}`);
    }

    add('Porcentaje del vehículo', input.vehiclePercentage, '%');
    add('Gasto de gas', input.gas);
    add('Gasto de nafta', input.fuel);

    if (Array.isArray(input.vouchers)) {
      lines.push(
        input.vouchers.length === 0
          ? '- Vales: ninguno'
          : `- Vales: ${input.vouchers.map((v, i) => this.describeVoucherForModel(v, i)).join('; ')}`,
      );
    }

    const pending: string =
      missing.length > 0
        ? `Datos que aún faltan: ${missing.map((f) => CALCULATION_FIELD_LABELS[f] ?? f).join(', ')}.`
        : 'No faltan datos.';


    // SI EL BORRADOR INCLUYE PORCENTAJES, PERO NO SE SABE A QUE ROL CORRESPONDE CADA UNO, LO INDICO PARA QUE EL MODELO NO LOS USE.
    if (draft.missingFields?.includes('percentages') && input.agencyPercentage === undefined) {
      lines.push('- Había porcentajes en el mensaje o la imagen, pero sin saber a qué rol corresponde cada uno. Pedile que indique cuál es de agencia y cuál del chofer.');
    }

    return ['Estado del cierre (datos ya registrados por el sistema):', ...lines, pending].join('\n');
  }

  // UN VALE EN TEXTO NATURAL PARA EL MODELO, SIN NOMBRES DE CAMPOS INTERNOS NI JSON.
  private describeVoucherForModel(voucher: ICalculationVoucher, index: number): string {
    const parts: string[] = [];
    if (voucher.type) parts.push(voucher.type === EVoucherType.FABRICA ? EVoucherType.FABRICA : EVoucherType.OTRO);
    if (voucher.name) parts.push(`nombre ${JSON.stringify(voucher.name)}`);
    if (voucher.trips !== undefined) parts.push(`${voucher.trips} viajes`);
    if (voucher.pricePerTrip !== undefined) parts.push(`precio real ${voucher.pricePerTrip} por viaje`);
    if (voucher.fixedFeePerTrip !== undefined) {
      parts.push(`precio planilla ${voucher.fixedFeePerTrip} por viaje`);
    }
    return `vale ${index + 1} (${parts.join(', ')})`;
  }

  // BORRA TODAS LAS CONVERSACIONES DEL USUARIO (VIGENTES Y VENCIDAS) CON SUS IMAGENES EN CLOUDINARY.
  // SI FALLA CLOUDINARY, purgeConversation LANZA ERROR Y SE ABORTA (NADA SE PIERDE A MEDIAS).
  async purgeAllUserData(userId: string): Promise<void> {
    // GUARDO LA BUSQUEDA DE TODAS LAS CONVERSACIONES DE UN USUARIO
    const conversations: ConversationEntity[] = await this.conversationRepository.find({
      where: { userId },
    });
    // RECORRO TODAS LAS CONVERSACIONES
    for (const conversation of conversations) {
      await this.purgeConversation(userId, conversation);
    }
  }

  // FUNCION QUE BORRA EL TURNO FALLIDO DE LA CONVERSACION (SI ES NUEVA, BORRA LA CONVERSACION; SI NO, SOLO EL MENSAJE DEL USUARIO SI YA EXISTIA).
  private async discardFailedTurn(conversation: ConversationEntity, userMessage: ConversationMessageEntity, isNewConversation: boolean) {
    try {
      // VERIFICO SI ES NUEVA CONVERSACION
      if (isNewConversation) {
        await this.conversationRepository.delete(conversation.id);
      } else {
        await this.messageRepository.delete(userMessage.id);
      }
    } catch (error) {
      this.logger.warn(`No se pudo revertir el turno fallido de la conversacion ${conversation.id}`,
        this.errorStack(error));
    }
  }

  // LISTA LAS CONVERSACIONES VIGENTES (NO VENCIDAS) DEL USUARIO, ORDENADAS DE LA MAS RECIENTE A LA MAS ANTIGUA.
  async listConversations(user: IAuthUser) {
    try {

      // EMPIEZA CON VOID PORQUE cleanupExpiredConversations ES ASINCRONO Y NO DEVUELVE NADA, PERO QUIERO QUE SE EJECUTE ANTES DE LA CONSULTA.
      void this.cleanupExpiredConversations(user.id);
      const now: Date = new Date();
      return await this.conversationRepository.find({
        where: { userId: user.id, expiresAt: MoreThan(now) },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.handleUnexpectedError(error, 'listConversations');
    }
  }

  // DEVUELVE LOS MENSAJES DE UNA CONVERSACION SI ES DEL USUARIO Y NO ESTA VENCIDA (TTL 24hs)
  async getMessages(user: IAuthUser, id: string) {
    try {
      const conversation: ConversationEntity = await this.requireOwnedActiveConversation(user.id, id);
      const messages: ConversationMessageEntity[] = await this.messageRepository.find({
        where: { conversationId: conversation.id },
        relations: { images: true },
        order: { createdAt: 'ASC' },
      });

      // AGRUPO LOS CALCULOS POR MENSAJE PARA DEVOLVERLOS JUNTO AL ASISTENTE.
      const calculations: ConversationCalculationEntity[] = await this.calculationRepository.find({
        where: { conversationId: conversation.id },
      });

      const calculationByMessage: Map<string, ICalculationState> = new Map<string, ICalculationState>();
      for (const calculation of calculations) {
        if (calculation.messageId) {
          calculationByMessage.set(
            calculation.messageId,
            await this.serializeCalculation(calculation, user.id),
          );
        }
      }

      return {
        conversation,
        messages: messages.map((message) => ({
          ...this.serializeMessage(message, message.images ?? []),
          calculation: calculationByMessage.get(message.id) ?? null,
        })),
      };
    } catch (error) {
      this.handleUnexpectedError(error, 'getMessages');
    }
  }

  // BORRA IMAGENES (CLOUDINARY), CARPETA Y FILAS DE UNA CONVERSACION.
  // SI FALLA EL BORRADO DE IMAGENES LANZA ERROR Y CONSERVA LA CONVERSACION PARA REINTENTAR.
  private async purgeConversation(
    userId: string,
    conversation: ConversationEntity,
  ): Promise<void> {
    // Reuno las referencias antes de borrar en DB: el cascade eliminaria las
    // filas de imagenes y perderia los public_id necesarios para Cloudinary.
    const images: ConversationMessageImageEntity[] = await this.imageRepository
      .createQueryBuilder('image')
      .innerJoin('image.message', 'message')
      .where('message.conversationId = :conversationId', {
        conversationId: conversation.id,
      })
      .select(['image.publicId'])
      .getMany();
    const publicIds: string[] = [...new Set(images.map((image) => image.publicId))];

    // Borro primero en Cloudinary; si algo falla, conservo la conversacion
    // para no perder las referencias y permitir reintentar.
    const results: PromiseSettledResult<void>[] = await Promise.allSettled(
      publicIds.map((publicId) => this.cloudinary.deleteImage(publicId)),
    );
    const failed: PromiseRejectedResult[] = results.filter((result) => result.status === 'rejected');

    if (failed.length > 0) {
      this.logger.error(
        `No se pudieron eliminar ${failed.length} imagen(es) de Cloudinary para la conversacion ${conversation.id}`,
      );
      throw new ServiceUnavailableException(
        'No se pudieron eliminar las imágenes de la conversación. Intentá nuevamente.',
      );
    }

    // Las imagenes ya se borraron; quito la carpeta (vacia), derivada de los public_id.
    const userPrefix: string = `liquid-chofer/users/${userId}/`;
    const folders: Set<string> = new Set(
      publicIds
        .map((publicId) => conversationFolderFromPublicId(publicId))
        .filter((folder): folder is string => folder !== null && folder.startsWith(userPrefix)),
    );

    for (const folder of folders) {
      try {
        await this.cloudinary.deleteConversationFolder(folder);
      } catch (error) {
        // No bloqueo el borrado: lo sensible (los archivos) ya se elimino.
        this.logger.warn(
          `No se pudo eliminar la carpeta de Cloudinary de la conversacion ${conversation.id}`,
          this.errorStack(error),
        );
      }
    }

    await this.conversationRepository.delete(conversation.id);
  }

  // BORRA UNA CONVERSACION MANUALMENTE (SI ES DEL USUARIO) Y SUS IMAGENES EN CLOUDINARY. 
  async removeConversation(user: IAuthUser, id: string) {
    try {
      const conversation: ConversationEntity = await this.requireOwnedActiveConversation(user.id, id);
      await this.purgeConversation(user.id, conversation)
      return { message: 'Conversación eliminada.' };
    } catch (error) {
      this.handleUnexpectedError(error, 'removeConversation');
    }
  }

  private async cleanupExpiredConversations(userId: string): Promise<void> {
    if (this.cleaningUsers.has(userId)) return; // SI YA CONTIENE EL ID
    this.cleaningUsers.add(userId);

    try {
      const expired: ConversationEntity[] = await this.conversationRepository.find({
        where: { userId, expiresAt: LessThanOrEqual(new Date()) },
        order: { expiresAt: 'ASC' },
        take: 10 // POR TANDA: EL RESTO SE LIMPIA EN LAS PROXIMAS VISITAS
      })

      // RECORRER CADA CONVERSASION EXPIRADA DEL USUARIO POR SU ID
      for (const conversation of expired) {
        try {
          await this.purgeConversation(userId, conversation);
        } catch (error) {
          this.logger.warn(
            `No se pudo limpiar la conversacion vencida ${conversation.id}`,
            this.errorStack(error),
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Fallo la limpieza de conversaciones vencidas del usuario ${userId}`,
        this.errorStack(error),
      );
    } finally {
      this.cleaningUsers.delete(userId);
    }
  }

  // REPORTA LA CUOTA RESTANTE DEL DIA DEL USUARIO.
  async getUsage(user: IAuthUser) {
    try {
      const used: number = await this.usageForToday(user.id);
      return {
        limit: this.dailyLimit,
        used,
        remaining: Math.max(0, this.dailyLimit - used),
      };
    } catch (error) {
      this.handleUnexpectedError(error, 'getUsage');
    }
  }

  // ---- HELPERS INTERNOS ----

  // VALIDA QUE EL USUARIO NO HAYA ALCANZADO EL LIMITE DIARIO DE MENSAJES.
  private async enforceDailyLimit(userId: string): Promise<void> {
    const used: number = await this.usageForToday(userId);
    if (used >= this.dailyLimit) {
      throw new ForbiddenException('Alcanzaste tu límite diario gratuito. Probá de nuevo mañana.');
    }
  }

  // CUENTA LOS MENSJES DE IA CONSUMIDOS HOY POR EL USUARIO.
  private async usageForToday(userId: string): Promise<number> {
    const today: string = this.localDateKey();
    const record: UserDailyUsageEntity | null = await this.usageRepository.findOne({
      where: { userId, usageDate: today },
    });
    return record?.messagesUsed ?? 0;
  }

  // AUMENTA EN 1 EL CONTADOR DE MENSAJES DE IA CONSUMIDOS HOY POR EL USUARIO.
  private async incrementUsage(userId: string): Promise<void> {
    const today: string = this.localDateKey();
    const existing: UserDailyUsageEntity | null = await this.usageRepository.findOne({
      where: { userId, usageDate: today },
    });

    if (existing) {
      existing.messagesUsed += 1;
      await this.usageRepository.save(existing);
      return;
    }

    // PRIMER USO DEL DIA: CREO EL REGISTRO DE CONSUMO.
    await this.usageRepository.save(
      this.usageRepository.create({
        userId,
        usageDate: today,
        messagesUsed: 1,
      }),
    );
  }

  // DEVUELVE LA CONVERSACION DEL USUARIO (NUEVA O REUTILIZADA SI ES VALIDA).
  // SI ES NUEVA, SE TITULA CON EL PRIMER MENSAJE PARA QUE EL HISTORIAL SEA RECONOCIBLE.
  private async resolveConversation(
    userId: string,
    conversationId?: string,
    firstMessage?: string,
  ): Promise<ConversationEntity> {
    if (conversationId) {
      const existing: ConversationEntity | null = await this.conversationRepository.findOne({
        where: { id: conversationId, userId },
      });
      // Si existe y sigue vigente, la reutilizo; si vencio, creo otra.
      if (existing && existing.expiresAt > new Date()) return existing;
    }

    // Nueva conversacion con vigencia de 24 horas y titulo derivado del primer mensaje.
    const title: string = firstMessage?.trim().slice(0, 40).replace(/\s+/g, ' ') || 'Nuevo chat';
    return this.conversationRepository.save(
      this.conversationRepository.create({
        userId,
        title,
        expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
      }),
    );
  }

  // VERIFICA QUE LA CONVERSACION LE PERTENEZCA AL USUARIO Y ESTE VIGENTE.
  private async requireOwnedActiveConversation(
    userId: string,
    id: string,
  ): Promise<ConversationEntity> {
    const found: ConversationEntity | null = await this.conversationRepository.findOne({
      where: { id, userId },
    });
    // SI NO EXISTE O YA VENCIÓ LA CONVERSACION, LANZO ERROR 404 PARA NO DAR PISTAS DE SU EXISTENCIA.
    if (!found || found.expiresAt <= new Date()) {
      throwConversationNotFound();
    }
    // TRAS LA VALIDACION, 'found' QUEDA REGISTRADO COMO NO NULO PARA EL RESTO DEL FLUJO.
    return found!;
  }

  // GUARDA UN MENSAJE EN LA DB Y LO DEVUELVE.
  private async saveMessage(
    conversationId: string,
    role: ERole,
    content: string,
  ) {
    return this.messageRepository.save(
      this.messageRepository.create({ conversationId, role, content }),
    );
  }

  // SUBE CADA IMAGEN A CLOUDINARY Y GUARDA SU REFERENCIA EN LA DB. 
  // SI ALGO FALLA, REVIERTE LO YA SUBIDO/GUARDADO PARA NO DEJAR HUERFANOS.
  private async saveMessageImages(
    userId: string,
    conversation: ConversationEntity,
    message: ConversationMessageEntity,
    imagesData: string[],
  ): Promise<ConversationMessageImageEntity[]> {
    const uploadedPublicIds: string[] = [];
    const savedIds: string[] = [];

    // La ruta incluye timestamps para que Cloudinary las ordene cronologicamente.
    const assetFolder = buildConversationImageFolder({
      userId,
      conversationId: conversation.id,
      conversationCreatedAt: conversation.createdAt,
      messageId: message.id,
      messageCreatedAt: message.createdAt,
    });
    const tags: string[] = buildConversationImageTags(userId, conversation.id);

    try {
      const saved: ConversationMessageImageEntity[] = [];
      for (const [position, dataUri] of imagesData.entries()) {
        const publicId = await this.cloudinary.uploadPrivateImage(dataUri, {
          assetFolder,
          fileName: buildConversationImageFileName(position),
          tags,
        });
        uploadedPublicIds.push(publicId);

        const image: ConversationMessageImageEntity = await this.imageRepository.save(
          this.imageRepository.create({
            messageId: message.id,
            publicId,
            position,
          }),
        );
        savedIds.push(image.id);
        saved.push(image);
      }
      return saved;
    } catch (error) {
      // LIMPIO LO QUE SE ALCANZÓ A CREAR EN ESTE INTENTO (IMAGENES EN CLOUDINARY Y FILAS EN DB) PARA NO DEJAR HUELLAS.
      if (savedIds.length) await this.imageRepository.delete(savedIds);
      await Promise.allSettled(
        uploadedPublicIds.map((publicId) => this.cloudinary.deleteImage(publicId)),
      );
      throw error;
    }
  }

  // AGREGA LA URL FIRMADA DE CADA IMAGEN PARA PODER RENDERIZARLA EN EL FRONTEND.
  // SOLO SE LLAMA DESPUES DE VALIDAR QUE LA CONVERSACION PERTENECE AL USUARIO.
  private serializeMessage(
    message: ConversationMessageEntity,
    images: ConversationMessageImageEntity[],
  ) {
    return {
      ...message,
      images: images
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((image) => ({
          id: image.id,
          position: image.position,
          createdAt: image.createdAt,
          url: this.cloudinary.getSignedUrl(image.publicId),
        })),
    };
  }

  //BUSCA EL CALCULO ACTIVO (BORRADOR O OFERTA) PARA QUE EL MODELO PUEDA USARLO COMO CONTEXTO Y NO PEDIR DATOS QUE YA TIENE.
  private async getActiveCalculation(
    conversationId: string,
  ): Promise<ConversationCalculationEntity | null> {
    return this.calculationRepository.findOne({
      where: {
        conversationId,
        status: In(['needs_data', 'offer']),
      },
      order: { updatedAt: 'DESC' },
    });
  }

  // DEVUELVE EL ULTIMO CAMBIO COMPLETADO DEL CALCULO (BORRADOR O CONFIRMADO) PARA QUE EL MODELO PUEDA CORREGIRLO O CONFIRMARLO.
  private async getLatestCompletedCalculation(
    conversationId: string,
  ): Promise<ConversationCalculationEntity | null> {
    return this.calculationRepository.findOne({
      where: { conversationId, status: 'completed' },
      order: { updatedAt: 'DESC' },
    });
  }

  // FUSIONA LOS DATOS PREVIIOS CON LOS NUEVOS EXTRAIDOS DEL MODELO, SIN PERDER LOS DATOS QUE YA TENIA EL BORRADOR (SI EXISTE). LO NUEVO TIENE PRIORIDAD.
  private mergeCalculationInput(
    base: Partial<ICalculationInput> | null | undefined,
    incoming: TCalculationExtraction | null,
  ): TCalculationExtraction {
    return {
      totalInvoiced: incoming?.totalInvoiced ?? base?.totalInvoiced,
      vouchers: incoming?.vouchers ?? base?.vouchers,
      agencyPercentage: incoming?.agencyPercentage ?? base?.agencyPercentage,
      driverPercentage: incoming?.driverPercentage ?? base?.driverPercentage,
      vehicleRented: incoming?.vehicleRented ?? base?.vehicleRented,
      vehiclePercentage: incoming?.vehiclePercentage ?? base?.vehiclePercentage,
      carOwner: incoming?.carOwner ?? base?.carOwner,
      gas: incoming?.gas ?? base?.gas,
      fuel: incoming?.fuel ?? base?.fuel,
    };
  }

  // PERSISTE EL CALCULO (BORRADOR, OFERTA O CONFIRMADO) JUNTO AL MENSAJE DEL ASISTENTE.
  private async saveCalculation(
    conversationId: string,
    messageId: string,
    pending: IPendingCalculation,
    existing: ConversationCalculationEntity | null,
  ): Promise<ConversationCalculationEntity> {
    // REUTILIZO EL BORRADOR EXISTENTE SI NO ESTA COMPLETADO, SINO CREO UNO NUEVO
    const entity =
      existing && existing.status !== 'completed'
        ? existing
        : this.calculationRepository.create({ conversationId });

    entity.messageId = messageId;
    entity.status = pending.status;
    entity.input = pending.input;
    entity.missingFields = pending.missingFields;
    entity.result = pending.result ?? null;

    return this.calculationRepository.save(entity);
  }

  // ADAPTA LA ENTIDAD DE CALCULO A LA INTERFAZ QUE USA EL FRONTEND (SIN NOMBRES INTERNOS).
  // LA JORNADA VIGENTE SE RESUELVE DESDE journeys (FUENTE DE VERDAD), NO DESDE UN ESTADO LOCAL.
  private async serializeCalculation(
    calculation: ConversationCalculationEntity,
    userId: string,
  ): Promise<ICalculationState> {
    const savedJourney: JourneyHistoryEntity | null = await this.journeyRepository.findOne({
      where: { userId, sourceCalculationId: calculation.id },
      order: { createdAt: 'DESC' },
      select: { id: true },
    });

    return {
      id: calculation.id,
      status: calculation.status,
      missingFields: calculation.missingFields ?? [],
      input: this.calculations.withDerivedVehiclePercentage(calculation.input ?? {}),
      result: calculation.result ?? undefined,
      updatedAt: calculation.updatedAt,
      savedJourneyId: savedJourney?.id ?? null,
    };
  }

  // REPUESTA DETERMINISTA PARA EL USUARIO SEGUN EL ESTADO DEL CALCULO Y LOS DATOS FALTANTES
  private buildCalculationReply(
    status: TCalculationStatus,
    missingFields: string[],
    unclearFields: string[] = [],
    percentagesMessage?: string,
    voucherDetail?: string
  ): string {

    // SI EL CALCULO YA ESTA COMPLETO, NO HAY DATOS FALTANTES NI CONFUSOS
    if (status === 'completed') {
      return 'Listo. Calculé el cierre de tu jornada. Podés revisar el resultado, descargarlo o compartirlo.';
    }

    // SI EL CALCULO ESTA EN OFERTA, NO HAY DATOS FALTANTES NI CONFUSOS
    if (status === 'offer') {
      return 'Ya tengo los datos del cierre. Si querés, confirmá el cálculo y te genero el resultado para descargar o compartir.';
    }

    // SI HAY DATOS FALTANTES O CONFUSOS, LOS DETALLO EN TEXTO NATURAL PARA QUE EL USUARIO LOS CORRIJA
    if (percentagesMessage) {
      return `No se puede calcular: ${percentagesMessage}. Corregí el porcentaje que no corresponda, por texto o con una imagen.`;
    }

    // FUNCION QUE CREA NUEVO ARRAY DE ETIQUETAS PARA LOS CAMPOS FALTANTES O CONFUSOS, USANDO EL DETALLE DEL VALE SI ES NECESARIO
    const labels = (fields: string[]) => fields.map((field) => field === 'vouchers' && voucherDetail
      ? voucherDetail // SI HAY DETALLE DE VALE, LO USO EN LUGAR DE LA ETIQUETA GENERICA
      : (CALCULATION_FIELD_LABELS[field] ?? field), // SI NO, USO LA ETIQUETA GENERICA O EL NOMBRE DEL CAMPO
    );

    // FUNCION QUE UNE LAS ETIQUETAS EN UN STRING SEPARADO POR COMAS
    const joinFields = (fields: string[]) => labels(fields).join(', ');

    // CREO UN ARRAY DE PARTES DEL MENSAJE FINAL, QUE SE IRAN CONCATENANDO SEGUN LOS DATOS FALTANTES O CONFUSOS
    const parts: string[] = [];

    // SI HAY DATOS FALTANTES
    if (missingFields.length > 0) {
      // LOS AGREGAMOS AL MENSAJE FINAL CON LA ETIQUETA CORRESPONDIENTE
      parts.push(`Faltan: ${joinFields(missingFields)}.`);
    }

    // CREAMOS UN NUEVO ARRAY DE CAMPOS CONFUSOS EXCLUYENDO EL CAMPO 'percentages' PARA NO REPETIRLO EN EL MENSAJE FINAL
    const otherUnclear: string[] = unclearFields.filter((field) => field !== 'percentages');

    // SI HAY CAMPOS CONFUSOS EXCLUYENDO 'percentages'
    if (otherUnclear.length > 0) {
      // LO AGREGAMOS AL MENSAJE FINAL CON LA ETIQUETA CORRESPONDIENTE
      parts.push(`No se entiende: ${joinFields(otherUnclear)}.`);
    }

    //SI HAY CAMPOS CONFUSOS INCLUYENDO 'percentages'
    if (unclearFields.includes('percentages')) {
      parts.push('Vi porcentajes, pero no está claro a quién corresponde cada uno. Decímelo así: ej:"agencia 20, chofer 30".');
    } else {
      // SI NO, SUGIERO PASAR LOS DATOS POR TEXTO O CON UNA IMAGEN MAS CLARA
      parts.push('Pasámelos por texto o con una imagen más clara.');
    }

    return parts.join(' ');
  }

  // DETALLA QUE LE FALTA A CADA VALE (TIPO, NOMBRE, VIAJES, PRECIO REAL Y PRECIO PLANILLA) PARA QUE EL USUARIO LO COMPLETE
  private describeVoucherGaps(input: TCalculationExtraction): string | undefined {
    if (!Array.isArray(input.vouchers)) return undefined;

    const gaps: string[] = input.vouchers
      .map((voucher, index) => ({
        index,
        missing: this.calculations.getVoucherMissingFields(voucher),
      }))
      .filter(({ missing }) => missing.length > 0)
      .map(
        ({ index, missing }) =>
          `vale ${index + 1}: ${missing.map((f) => VOUCHER_FIELD_LABELS[f] ?? f).join(', ')}`,
      );

    return gaps.length > 0 ? gaps.join('; ') : undefined;
  }


  // CARGA EL HISTORIAL DE MENSAJES DE LA CONVERSACION PARA ENVIARLO AL MODELO (TTL 24hs)
  private async loadHistory(conversationId: string): Promise<IChatMessage[]> {
    const messages: ConversationMessageEntity[] = await this.messageRepository.find({
      where: { conversationId },
      relations: { images: true },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return messages.reverse().map((m) => ({
      role: m.role as ERole,
      // LE AVISO AL MODELO DE TEXTO QUE HUBO IMAGEN: SUS DATOS YA ESTAN EN EL ESTADO DEL CIERRE
      content: m.images?.length
        ? `${m.content} [adjuntó ${m.images.length} imagen(es); los datos que traía ya están registrados]`.trim()
        : m.content,
    }));
  }

  // Fecha local en formato YYYY-MM-DD para agrupar el uso diario.
  private localDateKey(): string {
    const d: Date = new Date();
    const mm: string = String(d.getMonth() + 1).padStart(2, '0');
    const dd: string = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // Conserva los errores HTTP conocidos y convierte el resto en un 500 claro.
  private handleUnexpectedError(error: unknown, operation: string): never {
    if (error instanceof HttpException) throw error;

    this.logger.error(
      `Error inesperado en ${operation}`,
      this.errorStack(error),
    );
    throw new InternalServerErrorException(
      'No se pudo completar la operación. Intentá nuevamente.',
    );
  }

  private errorStack(error: unknown): string {
    if (error instanceof Error) return error.stack ?? error.message;
    return 'Error desconocido';
  }
}

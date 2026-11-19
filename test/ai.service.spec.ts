import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { AiService } from '../src/module/ai/ai.service.js';
import { CalculationService } from '../src/module/ai/calculation.service.js';
import type { OpenAIProvider } from '../src/module/ai/ia.provider.js';
import type { CloudinaryService } from '../src/module/ai/cloudinary.services.js';
import type { ConversationEntity } from '../src/shared/entities/conversation.entity.js';
import type { ConversationMessageEntity } from '../src/shared/entities/conversation-message.entity.js';
import type { ConversationMessageImageEntity } from '../src/shared/entities/conversation-message-image.entity.js';
import type { ConversationCalculationEntity } from '../src/shared/entities/conversation-calculation.entity.js';
import type { UserDailyUsageEntity } from '../src/shared/entities/user-daily-usage.entity.js';
import type { JourneyHistoryEntity } from '../src/shared/entities/journey-history.entity.js';
import type { IAuthUser } from '../src/shared/types/auth.types.js';

const user: IAuthUser = {
  id: 'user-1',
  firebaseUid: 'firebase-1',
  email: 'user@test.com',
  displayName: 'Usuario',
  photoUrl: null,
};

const activeConversation = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'conv-1',
    userId: 'user-1',
    title: 'Mi chat',
    createdAt: new Date('2026-01-01T10:00:00Z'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  }) as unknown as ConversationEntity;

describe('AiService', () => {
  let conversationRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let messageRepo: {
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let imageRepo: {
    createQueryBuilder: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let calculationRepo: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let usageRepo: {
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let journeyRepo: { findOne: ReturnType<typeof vi.fn> };
  let ia: { chatWithCalculation: ReturnType<typeof vi.fn> };
  let cloudinary: {
    uploadPrivateImage: ReturnType<typeof vi.fn>;
    deleteImage: ReturnType<typeof vi.fn>;
    deleteConversationFolder: ReturnType<typeof vi.fn>;
    getSignedUrl: ReturnType<typeof vi.fn>;
  };
  let service: AiService;

  beforeEach(() => {
    conversationRepo = {
      find: vi.fn(async () => []),
      findOne: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      delete: vi.fn(async () => ({ affected: 1 })),
    };
    messageRepo = {
      find: vi.fn(async () => []),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      delete: vi.fn(async () => ({ affected: 1 })),
    };
    imageRepo = {
      createQueryBuilder: vi.fn(),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
      delete: vi.fn(async () => ({ affected: 1 })),
    };
    calculationRepo = {
      find: vi.fn(async () => []),
      findOne: vi.fn(async () => null),
      create: vi.fn((value: unknown) => ({ ...(value as object), id: 'calc-1' })),
      save: vi.fn(async (value: unknown) => ({
        ...(value as object),
        updatedAt: new Date(),
      })),
    };
    usageRepo = {
      findOne: vi.fn(async () => null),
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => value),
    };
    journeyRepo = { findOne: vi.fn(async () => null) };
    ia = { chatWithCalculation: vi.fn() };
    cloudinary = {
      uploadPrivateImage: vi.fn(async () => 'folder/image'),
      deleteImage: vi.fn(async () => undefined),
      deleteConversationFolder: vi.fn(async () => undefined),
      getSignedUrl: vi.fn(() => 'signed-url'),
    };

    const config = {
      getOrThrow: vi.fn(() => '5'),
      get: vi.fn(),
    } as unknown as ConfigService;

    service = new AiService(
      conversationRepo as unknown as Repository<ConversationEntity>,
      messageRepo as unknown as Repository<ConversationMessageEntity>,
      imageRepo as unknown as Repository<ConversationMessageImageEntity>,
      calculationRepo as unknown as Repository<ConversationCalculationEntity>,
      usageRepo as unknown as Repository<UserDailyUsageEntity>,
      journeyRepo as unknown as Repository<JourneyHistoryEntity>,
      ia as unknown as OpenAIProvider,
      cloudinary as unknown as CloudinaryService,
      new CalculationService(),
      config,
    );
  });

  it('happy path: listado de conversaciones vigentes', async () => {
    const conv = activeConversation();
    conversationRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([conv]);

    await expect(service.listConversations(user)).resolves.toEqual([conv]);
    expect(conversationRepo.find).toHaveBeenCalledTimes(2);
  });

  it('happy path: historial agrupa cálculo e imagen firmada', async () => {
    conversationRepo.findOne.mockResolvedValue(activeConversation());
    messageRepo.find.mockResolvedValue([
      {
        id: 'msg-1',
        role: 'user',
        content: 'hola',
        images: [{ id: 'img-1', position: 0, publicId: 'folder/img', createdAt: new Date() }],
      },
    ]);
    calculationRepo.find.mockResolvedValue([
      {
        id: 'calc-1',
        messageId: 'msg-1',
        status: 'needs_data',
        input: {},
        missingFields: ['gas'],
        updatedAt: new Date(),
      },
    ]);

    const result = await service.getMessages(user, 'conv-1');

    expect(result.messages[0].images[0].url).toBe('signed-url');
    expect(result.messages[0].calculation).toMatchObject({ status: 'needs_data' });
  });

  it('qué pasa si: la conversación es ajena o expiró', async () => {
    conversationRepo.findOne.mockResolvedValue(null);

    await expect(service.getMessages(user, 'conv-otra')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(messageRepo.find).not.toHaveBeenCalled();
  });

  it('happy path: elimina una conversación propia y sus imágenes', async () => {
    conversationRepo.findOne.mockResolvedValue(activeConversation());
    const queryBuilder = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getMany: vi.fn(async () => [{ publicId: 'folder/img-1' }]),
    };
    imageRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    await expect(service.removeConversation(user, 'conv-1')).resolves.toEqual({
      message: 'Conversación eliminada.',
    });

    expect(cloudinary.deleteImage).toHaveBeenCalledWith('folder/img-1');
    expect(conversationRepo.delete).toHaveBeenCalledWith('conv-1');
  });

  it('qué pasa si: falla Cloudinary al borrar imágenes', async () => {
    conversationRepo.findOne.mockResolvedValue(activeConversation());
    const queryBuilder = {
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      getMany: vi.fn(async () => [{ publicId: 'folder/img-1' }]),
    };
    imageRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    cloudinary.deleteImage.mockRejectedValue(new Error('Cloudinary down'));

    await expect(
      service.removeConversation(user, 'conv-1'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(conversationRepo.delete).not.toHaveBeenCalled();
  });

  it('happy path: reporta la cuota diaria', async () => {
    usageRepo.findOne.mockResolvedValue({ messagesUsed: 2 });

    await expect(service.getUsage(user)).resolves.toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
    });
  });

  it('qué pasa si: alcanzó el límite diario', async () => {
    usageRepo.findOne.mockResolvedValue({ messagesUsed: 5 });

    await expect(service.chat(user, 'hola')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(conversationRepo.save).not.toHaveBeenCalled();
  });

  it('happy path: confirmación pura no consulta al modelo y persiste el cálculo', async () => {
    conversationRepo.create.mockImplementation((value: unknown) => ({
      ...(value as object),
      id: 'conv-1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }));
    let messageIndex = 0;
    messageRepo.create.mockImplementation((value: unknown) => ({
      ...(value as object),
      id: `msg-${++messageIndex}`,
      createdAt: new Date(),
    }));
    calculationRepo.create.mockImplementation((value: unknown) => ({
      ...(value as object),
      id: 'calc-1',
      updatedAt: new Date(),
    }));

    const result = await service.chat(user, undefined, undefined, undefined, true);

    expect(ia.chatWithCalculation).not.toHaveBeenCalled();
    expect(result.conversationId).toBe('conv-1');
    expect(result.calculation).toMatchObject({ status: 'needs_data' });
    expect(usageRepo.save).toHaveBeenCalled();
  });
});

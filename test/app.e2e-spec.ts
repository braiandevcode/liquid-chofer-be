import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { HealthModule } from '../src/core/health/health.module.js';
import { ApiBasePath } from '../src/core/config/config.endpoints.js';

// Se levanta solo HealthModule: el AppModule completo exige MySQL y Firebase.
describe('health (e2e)', () => {
  let app: INestApplication<Server> | undefined;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/api/v1/health (GET)', async () => {
    await request(app!.getHttpServer())
      .get(`/${ApiBasePath.HEALTH}`)
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('qué pasa si: se llama con otro método', async () => {
    await request(app!.getHttpServer())
      .post(`/${ApiBasePath.HEALTH}`)
      .expect(404);
  });

  afterEach(async () => {
    if (app) await app.close();
  });
});

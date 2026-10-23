import {
  Controller,
  Get,
  INestApplication,
  Logger,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { missingResponseSchema } from './missing-response.schema';

@Controller()
class FakeController {
  @Get('no-schema') noSchema() {
    return { secret: 'leak' };
  }

  @Get('with-schema')
  @SerializeOptions({ schema: z.object({ id: z.number() }) })
  withSchema() {
    return { id: 1, secret: 'leak' };
  }

  @Get('string') text() {
    return 'hello';
  }
}

describe('missingResponseSchema (global default)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FakeController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(app.get(Reflector), {
        schema: missingResponseSchema,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('route sans @SerializeOptions → 500 sans fuite', async () => {
    // Nest logs the exception before answering 500: capture it instead of printing it.
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});

    const res = await request(app.getHttpServer()).get('/no-schema');

    expect(res.status).toBe(500);
    expect(res.text).not.toContain('leak');
    expect(String(logSpy.mock.calls[0][0])).toContain(
      'Route without @SerializeOptions',
    );
    logSpy.mockRestore();
  });

  it('route avec @SerializeOptions → 200 filtrée', async () => {
    const res = await request(app.getHttpServer()).get('/with-schema');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
  });

  it('route string → 200 intacte', async () => {
    const res = await request(app.getHttpServer()).get('/string');

    expect(res.status).toBe(200);
    expect(res.text).toBe('hello');
  });

  it('le schéma rejette avec le message explicite', async () => {
    const result = await missingResponseSchema['~standard'].validate({});

    expect(result.issues?.[0].message).toBe(
      'Route without @SerializeOptions: declare a response schema',
    );
  });
});

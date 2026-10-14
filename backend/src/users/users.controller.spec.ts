import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// Copie ici l'import de StandardSchemaSerializerInterceptor tel qu'il est dans main.ts
import { StandardSchemaSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

// Test de bout en bout : vraie base de dev (DATABASE_URL), jamais la prod.
describe('GET /api/users/:id', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usersService: UsersService;

  const prefix = `t-${Date.now().toString(36)}`;
  const secretHash = 'hash-secret-a-ne-jamais-voir';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();

    // Doit refléter main.ts : adapte si main.ts change (préfixe, pipes, intercepteur).
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(
      new StandardSchemaSerializerInterceptor(app.get(Reflector), {}),
    );

    await app.init();

    prisma = app.get(PrismaService);
    usersService = app.get(UsersService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await app.close();
  });

  it('renvoie le pseudo seul pour un id existant', async () => {
    const user = await usersService.create({
      firstName: 'Test',
      lastName: 'User',
      pseudo: `${prefix}-ok`,
      email: `${prefix}-ok@test.local`,
      passwordHash: secretHash,
      birthDate: new Date('1990-01-01'),
    });

    const res = await request(app.getHttpServer())
      .get(`/api/users/${user.id}`)
      .expect(200);

    expect(res.body).toEqual({ pseudo: `${prefix}-ok` });
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body).not.toHaveProperty('email');
    expect(res.text).not.toContain(secretHash);
  });

  it('renvoie 404 pour un id inconnu', async () => {
    await request(app.getHttpServer())
      .get(`/api/users/${randomUUID()}`)
      .expect(404);
  });

  it("renvoie 400 pour un id qui n'est pas un UUID", async () => {
    await request(app.getHttpServer())
      .get('/api/users/pas-un-uuid')
      .expect(400);
  });
});

import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { UserInfo } from './users.struct';
import { UsersService } from './users.service';

// Test d'intégration : utilise la vraie base de dev (DATABASE_URL), jamais la prod.
describe('UsersService.create (doublons)', () => {
  let moduleRef: TestingModule;
  let service: UsersService;
  let prisma: PrismaService;

  // Préfixe unique par exécution : pseudo <= 20 caractères, minuscules, chiffres, tirets
  const prefix = `t-${Date.now().toString(36)}`;

  const makeUser = (name: string, overrides: Partial<UserInfo> = {}): UserInfo => ({
    firstName: 'Test',
    lastName: 'User',
    pseudo: `${prefix}-${name}`,
    email: `${prefix}-${name}@test.local`,
    birthDate: new Date('1990-01-01'),
    ...overrides,
  });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    service = moduleRef.get(UsersService, { strict: false });
    prisma = moduleRef.get(PrismaService, { strict: false });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await moduleRef.close();
  });

  it('crée un user et normalise email et pseudo', async () => {
    const created = await service.create(
      makeUser('norm', {
        email: `  ${prefix}-NORM@Test.local `,
        pseudo: ` ${prefix}-NORM `.toUpperCase(),
      }),
    );

    expect(created.id).toBeDefined();
    expect(created.email).toBe(`${prefix}-norm@test.local`);
    expect(created.pseudo).toBe(`${prefix}-norm`);
    expect(created.passwordHash).toBeNull();
    expect(created.phone).toBeNull();
  });

  it("rejette un doublon d'email avec un ConflictException", async () => {
    await service.create(makeUser('mail'));

    await expect(
      service.create(makeUser('mail2', { email: `${prefix}-mail@test.local` })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejette un doublon de pseudo avec un ConflictException', async () => {
    await service.create(makeUser('pseudo'));

    await expect(
      service.create(
        makeUser('pseudo2', { pseudo: `${prefix}-pseudo` }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejette un doublon email + pseudo avec un ConflictException', async () => {
    await service.create(makeUser('both'));

    await expect(service.create(makeUser('both'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('findByEmail retrouve un user quelle que soit la casse', async () => {
    const created = await service.create(makeUser('find'));
    const found = await service.findByEmail(`  ${prefix}-FIND@test.local `);

    expect(found?.id).toBe(created.id);
  });

  it('findByEmail renvoie null si inconnu', async () => {
    await expect(
      service.findByEmail(`${prefix}-inconnu@test.local`),
    ).resolves.toBeNull();
  });
});
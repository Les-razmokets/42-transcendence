import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

// Test unitaire : aucune connexion à Postgres, le pool pg ne se connecte qu'à la première requête.
describe('PrismaService', () => {
  const compileWith = (config: ConfigService) =>
    Test.createTestingModule({
      providers: [PrismaService, { provide: ConfigService, useValue: config }],
    }).compile();

  // Le vrai ConfigService lit aussi process.env : on retire DATABASE_URL pendant les tests
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
  });

  it('se construit quand DATABASE_URL est défini', async () => {
    const moduleRef = await compileWith(
      new ConfigService({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      }),
    );

    // Pas de toBeInstanceOf : le constructeur de PrismaClient renvoie un proxy
    expect(moduleRef.get(PrismaService).pokerTable).toBeDefined();
  });

  it('refuse de se construire si DATABASE_URL manque', async () => {
    await expect(compileWith(new ConfigService({}))).rejects.toThrow(
      /DATABASE_URL/,
    );
  });
});

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  NotFoundException,
  SerializeOptions,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { CasinosModule } from '../src/casinos/casinos.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RequireCasinoRole } from '../src/casinos/utils/casinos-role.decorator';
import { Public } from '../src/auth/utils/public.decorator';
import { COOKIE_NAME } from '../src/auth/utils/cookie';
import { CasinoRole, Role } from '../src/generated/prisma/client'; // value imports
import { NestExpressApplication } from '@nestjs/platform-express';

/*
 * @RequireCasinoRole() end to end, behind the REAL global guards (throttler, auth, roles),
 * with THROWAWAY controllers that only exist in this spec.
*/

const okSchema = z.object({ ok: z.boolean() });

@Controller('__test/casinos/:casinoId')
class TestCasinoController {
  @Get('floor')
  @RequireCasinoRole(CasinoRole.FLOOR)
  @SerializeOptions({ schema: okSchema })
  floor() {
    return { ok: true };
  }

  @Get('owner')
  @RequireCasinoRole(CasinoRole.OWNER)
  @SerializeOptions({ schema: okSchema })
  owner() {
    return { ok: true };
  }

  @Public() // @Public() must NOT be able to open a casino route
  @Get('public-floor')
  @RequireCasinoRole(CasinoRole.FLOOR)
  @SerializeOptions({ schema: okSchema })
  publicFloor() {
    return { ok: true };
  }
}

@Controller('__test')
class TestWiringController {
  // declared WITHOUT :casinoId in the path: a wiring mistake that must fail closed
  @Get('no-casino-id')
  @RequireCasinoRole(CasinoRole.FLOOR)
  @SerializeOptions({ schema: okSchema })
  noCasinoId() {
    return { ok: true };
  }
}

type Actor = 'anonymous' | 'plain' | 'floorA' | 'ownerA' | 'ownerB' | 'admin';
type CasinoKey = 'A' | 'B' | 'DELETED' | 'UNKNOWN';
type RouteName = 'floor' | 'owner';

describe('@RequireCasinoRole (e2e): the casino access matrix', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const PASSWORD = 'Correct-Horse-9-Battery!';
  const PEOPLE: Record<
    Exclude<Actor, 'anonymous'>,
    { pseudo: string; email: string }
  > = {
    plain: { pseudo: 'plain', email: 'plain@example.com' },
    floorA: { pseudo: 'floora', email: 'floora@example.com' },
    ownerA: { pseudo: 'ownera', email: 'ownera@example.com' },
    ownerB: { pseudo: 'ownerb', email: 'ownerb@example.com' },
    admin: { pseudo: 'admin', email: 'admin@example.com' },
  };

  const userIds = {} as Record<Exclude<Actor, 'anonymous'>, string>;
  const casinoIds = {} as Record<CasinoKey, string>;
  const agents = {} as Record<
    Exclude<Actor, 'anonymous'>,
    ReturnType<typeof request.agent>
  >;
  const membershipIds = {} as Record<'floorA' | 'ownerA', string>;

  const server = () => app.getHttpServer();

  const call = (actor: Actor, casino: CasinoKey, route: RouteName) => {
    const path = `/api/__test/casinos/${casinoIds[casino]}/${route}`;
    return actor === 'anonymous'
      ? request(server()).get(path)
      : agents[actor].get(path);
  };

  const register = async (u: { pseudo: string; email: string }) => {
    const res = await request(server())
      .post('/api/auth/register')
      .send({
        firstName: 'Test',
        lastName: 'Person',
        birthDate: '1990-01-01',
        password: PASSWORD,
        ...u,
      })
      .expect(201);
    return res.body.id as string;
  };

  const loggedInAgent = async (email: string) => {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return agent;
  };

  const newCasino = (name: string, deleted = false) =>
    prisma.casino.create({
      data: {
        name,
        city: 'Lausanne',
        address: 'Rue du Test 1',
        deletedAt: deleted ? new Date() : null,
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, CasinosModule],
      controllers: [TestCasinoController, TestWiringController], // throwaway routes, this spec only
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService, { strict: false });
  });

  beforeEach(async () => {
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.casino.deleteMany();

    for (const actor of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>) {
      userIds[actor] = await register(PEOPLE[actor]);
    }
    await prisma.user.update({
      where: { id: userIds.admin },
      data: { role: Role.ADMIN },
    });

    casinoIds.A = (await newCasino('Casino A')).id;
    casinoIds.B = (await newCasino('Casino B')).id;
    casinoIds.DELETED = (await newCasino('Casino Deleted', true)).id;
    casinoIds.UNKNOWN = randomUUID();

    membershipIds.floorA = (
      await prisma.membership.create({
        data: {
          userId: userIds.floorA,
          casinoId: casinoIds.A,
          role: CasinoRole.FLOOR,
        },
      })
    ).id;
    membershipIds.ownerA = (
      await prisma.membership.create({
        data: {
          userId: userIds.ownerA,
          casinoId: casinoIds.A,
          role: CasinoRole.OWNER,
        },
      })
    ).id;
    await prisma.membership.create({
      data: {
        userId: userIds.ownerB,
        casinoId: casinoIds.B,
        role: CasinoRole.OWNER,
      },
    });
    // ownerA also owns the deleted casino: being its owner must not help
    await prisma.membership.create({
      data: {
        userId: userIds.ownerA,
        casinoId: casinoIds.DELETED,
        role: CasinoRole.OWNER,
      },
    });

    for (const actor of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>) {
      agents[actor] = await loggedInAgent(PEOPLE[actor].email);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // actor, casino, route, expected status
  const matrix: [Actor, CasinoKey, RouteName, number][] = [
    // not logged in: authentication comes first
    ['anonymous', 'A', 'floor', 401],
    ['anonymous', 'A', 'owner', 401],

    // logged in, but no membership: the casino does not "exist" for them
    ['plain', 'A', 'floor', 404],
    ['plain', 'A', 'owner', 404],

    // FLOOR of A
    ['floorA', 'A', 'floor', 200],
    ['floorA', 'A', 'owner', 403], // member, role too low: they know the casino exists
    ['floorA', 'B', 'floor', 404], // another casino
    ['floorA', 'B', 'owner', 404],

    // OWNER of A (the hierarchy: an owner can do everything a floor can)
    ['ownerA', 'A', 'floor', 200],
    ['ownerA', 'A', 'owner', 200],
    ['ownerA', 'B', 'floor', 404], // owner of A has no power over B
    ['ownerA', 'B', 'owner', 404],

    // OWNER of B on A
    ['ownerB', 'A', 'floor', 404],
    ['ownerB', 'A', 'owner', 404],

    // ADMIN: explicit shortcut, any existing casino, any level
    ['admin', 'A', 'floor', 200],
    ['admin', 'A', 'owner', 200],
    ['admin', 'B', 'floor', 200],
    ['admin', 'B', 'owner', 200],

    // unknown casino: 404 for everybody, ADMIN included (existence is checked first)
    ['plain', 'UNKNOWN', 'floor', 404],
    ['ownerA', 'UNKNOWN', 'owner', 404],
    ['admin', 'UNKNOWN', 'floor', 404],

    // soft-deleted casino: 404 even for its own owner, and for the admin
    ['ownerA', 'DELETED', 'floor', 404],
    ['ownerA', 'DELETED', 'owner', 404],
    ['admin', 'DELETED', 'floor', 404],
  ];

  it.each(matrix)(
    '%s on casino %s, %s route -> %i',
    async (actor, casino, route, status) => {
      await call(actor, casino, route).expect(status);
    },
  );

  describe('the 404s and the 403 reveal nothing', () => {
    it('every 404 has the SAME body: non-member, other casino, unknown, deleted, admin on unknown', async () => {
      const responses = await Promise.all([
        call('plain', 'A', 'floor'), // exists, not a member
        call('ownerA', 'B', 'floor'), // exists, member of another casino
        call('ownerA', 'UNKNOWN', 'floor'), // does not exist
        call('ownerA', 'DELETED', 'floor'), // soft-deleted
        call('admin', 'UNKNOWN', 'floor'), // admin, does not exist
      ]);

      for (const r of responses) expect(r.status).toBe(404);
      for (const r of responses) expect(r.body).toEqual(responses[0].body);
      expect(responses[0].body).toEqual(new NotFoundException().getResponse());
    });

    it('the 403 does not say which role is required', async () => {
      const res = await call('floorA', 'A', 'owner').expect(403);
      const text = JSON.stringify(res.body);

      expect(text).not.toMatch(/owner|floor|role/i);
    });
  });

  describe('the membership is read from the database on every request', () => {
    it('promoted FLOOR -> OWNER: 403 becomes 200 with the SAME cookie, no new login', async () => {
      await call('floorA', 'A', 'owner').expect(403);

      await prisma.membership.update({
        where: { id: membershipIds.floorA },
        data: { role: CasinoRole.OWNER },
      });

      await call('floorA', 'A', 'owner').expect(200);
    });

    it('demoted OWNER -> FLOOR: 200 becomes 403 with the SAME cookie', async () => {
      await call('ownerA', 'A', 'owner').expect(200);

      await prisma.membership.update({
        where: { id: membershipIds.ownerA },
        data: { role: CasinoRole.FLOOR },
      });

      await call('ownerA', 'A', 'owner').expect(403);
    });

    it('membership removed: access is gone at once (and it is a 404, not a 403)', async () => {
      await call('floorA', 'A', 'floor').expect(200);

      await prisma.membership.delete({ where: { id: membershipIds.floorA } });

      await call('floorA', 'A', 'floor').expect(404);
    });

    it('membership added: access appears at once', async () => {
      await call('plain', 'A', 'floor').expect(404);

      await prisma.membership.create({
        data: {
          userId: userIds.plain,
          casinoId: casinoIds.A,
          role: CasinoRole.FLOOR,
        },
      });

      await call('plain', 'A', 'floor').expect(200);
    });

    it('casino deleted after login: its own owner is locked out at once', async () => {
      await call('ownerA', 'A', 'owner').expect(200);

      await prisma.casino.update({
        where: { id: casinoIds.A },
        data: { deletedAt: new Date() },
      });

      await call('ownerA', 'A', 'owner').expect(404);
    });
  });

  describe('identity and the global role come from the database too', () => {
    it('a signed token that CLAIMS admin does not skip the casino check', async () => {
      const lying = await jwt.signAsync({
        sub: userIds.plain,
        role: Role.ADMIN,
      });

      await request(server())
        .get(`/api/__test/casinos/${casinoIds.A}/floor`)
        .set('Cookie', `${COOKIE_NAME}=${lying}`)
        .expect(404); // still a plain user: no membership, not an admin
    });

    it('an admin demoted after login loses the shortcut at once', async () => {
      await call('admin', 'B', 'owner').expect(200);

      await prisma.user.update({
        where: { id: userIds.admin },
        data: { role: Role.USER },
      });

      await call('admin', 'B', 'owner').expect(404);
    });

    it('a member deleted after login is 401 (the authentication guard stops it first)', async () => {
      await call('ownerA', 'A', 'floor').expect(200);

      await prisma.user.update({
        where: { id: userIds.ownerA },
        data: { deletedAt: new Date() },
      });

      await call('ownerA', 'A', 'floor').expect(401);
    });
  });

  describe('declaration mistakes fail closed', () => {
    it('@Public() cannot open a casino route: anonymous gets 401, never 200', async () => {
      const res = await request(server()).get(
        `/api/__test/casinos/${casinoIds.A}/public-floor`,
      );

      expect(res.status).toBe(401);
    });

    it('a casino route declared without :casinoId is a 500, even for an admin, and says nothing about why', async () => {
      const res = await agents.admin
        .get('/api/__test/no-casino-id')
        .expect(500);
      const text = JSON.stringify(res.body);

      expect(text).not.toMatch(/casinoId|decorator|guard|route/i);
    });
  });

  describe('the throwaway routes are not part of the real app', () => {
    it('an app built WITHOUT the test controllers never answers 200 on them', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      let plain: NestExpressApplication = moduleRef.createNestApplication();
      configureApp(plain);
      await plain.init();

      try {
        const res = await request(plain.getHttpServer()).get(
          `/api/__test/casinos/${casinoIds.A}/floor`,
        );
        expect(res.status).not.toBe(200);
      } finally {
        await plain.close();
      }
    });
  });
});

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CasinoRole, Role } from '../src/generated/prisma/client'; 
import { NestExpressApplication } from '@nestjs/platform-express';

/*
 * Member routes end to end, behind the REAL global guards (throttler, auth, roles):
 *   GET    /api/casinos/:casinoId/members            FLOOR and above, ADMIN       -> [{ pseudo, role }]
 *   POST   /api/casinos/:casinoId/members            OWNER (adds FLOOR), ADMIN (adds either)  -> 201 { pseudo, role }
 *   PATCH  /api/casinos/:casinoId/members/:pseudo    ADMIN only                   -> 200 { pseudo, role }
 *   DELETE /api/casinos/:casinoId/members/:pseudo    OWNER (removes FLOOR), ADMIN (removes either) -> 204
 */

const ADD_FLOOR = { pseudo: 'newbie', role: CasinoRole.FLOOR };
const ADD_OWNER = { pseudo: 'newbie', role: CasinoRole.OWNER };
const PROMOTE = { role: CasinoRole.OWNER };
const DEMOTE = { role: CasinoRole.FLOOR };

type Actor =
  'anonymous' | 'plain' | 'floorA' | 'ownerA' | 'ownerB' | 'admin' | 'newbie';
type Person = Exclude<Actor, 'anonymous'> | 'ghost';
type CasinoKey = 'A' | 'B' | 'EMPTY' | 'DELETED' | 'UNKNOWN' | 'MALFORMED';
type Method = 'get' | 'post' | 'patch' | 'delete';
type Caller = Record<Method, (path: string) => request.Test>;

describe('Casino members (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const PASSWORD = 'Correct-Horse-9-Battery!';
  const PEOPLE: Record<Person, { pseudo: string; email: string }> = {
    plain: { pseudo: 'plain', email: 'plain@example.com' },
    floorA: { pseudo: 'floora', email: 'floora@example.com' },
    ownerA: { pseudo: 'ownera', email: 'ownera@example.com' },
    ownerB: { pseudo: 'ownerb', email: 'ownerb@example.com' },
    admin: { pseudo: 'admin', email: 'admin@example.com' },
    newbie: { pseudo: 'newbie', email: 'newbie@example.com' },
    ghost: { pseudo: 'ghost', email: 'ghost@example.com' }, // a deleted / anonymized account
  };

  const userIds = {} as Record<Person, string>;
  const casinoIds = {} as Record<CasinoKey, string>;
  const agents = {} as Record<
    Exclude<Person, 'ghost'>,
    ReturnType<typeof request.agent>
  >;

  const server = () => app.getHttpServer();

  // ---------------------------------------------------------------- helpers
  const caller = (actor: Actor) =>
    (actor === 'anonymous'
      ? request(server())
      : agents[actor]) as unknown as Caller;

  const send = (actor: Actor, method: Method, path: string, body?: unknown) => {
    const req = caller(actor)[method](path);
    return body === undefined ? req : req.send(body as object);
  };

  const url = (casino: CasinoKey, suffix = '') =>
    `/api/casinos/${casinoIds[casino]}/members${suffix}`;

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

  const newCasino = (name: string, address: string, deleted = false) =>
    prisma.casino.create({
      data: {
        name,
        city: 'Lausanne',
        address,
        deletedAt: deleted ? new Date() : null,
      },
    });

  const addMembership = (person: Person, casino: CasinoKey, role: CasinoRole) =>
    prisma.membership.create({
      data: { userId: userIds[person], casinoId: casinoIds[casino], role },
    });

  const roleOf = async (person: Person, casino: CasinoKey) =>
    (
      await prisma.membership.findUnique({
        where: {
          userId_casinoId: {
            userId: userIds[person],
            casinoId: casinoIds[casino],
          },
        },
      })
    )?.role ?? null;

  const countMembers = (casino: CasinoKey) =>
    prisma.membership.count({ where: { casinoId: casinoIds[casino] } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // users: created ONCE, never modified by the tests below
    await prisma.membership.deleteMany();
    await prisma.user.deleteMany();
    await prisma.casino.deleteMany();

    for (const person of Object.keys(PEOPLE) as Person[]) {
      userIds[person] = await register(PEOPLE[person]);
    }
    await prisma.user.update({
      where: { id: userIds.admin },
      data: { role: Role.ADMIN },
    });

    for (const person of Object.keys(PEOPLE) as Person[]) {
      if (person !== 'ghost')
        agents[person] = await loggedInAgent(PEOPLE[person].email);
    }
    // the ghost is deleted AFTER its registration: it can neither log in nor be added
    await prisma.user.update({
      where: { id: userIds.ghost },
      data: { deletedAt: new Date() },
    });
  });

  beforeEach(async () => {
    await prisma.membership.deleteMany();
    await prisma.casino.deleteMany();

    casinoIds.A = (await newCasino('Casino A', 'adrgsrynrgrtgvev')).id;
    casinoIds.B = (await newCasino('Casino B', 'ldriruhfaifhu')).id;
    casinoIds.EMPTY = (await newCasino('Casino Empty', 'alruhfapiuhpiahrrrrrr')).id; // no member at all
    casinoIds.DELETED = (await newCasino('Casino Deleted', 'LIUDHFAOIRHF', true)).id;
    casinoIds.UNKNOWN = randomUUID();
    casinoIds.MALFORMED = 'not-a-uuid';

    await addMembership('floorA', 'A', CasinoRole.FLOOR);
    await addMembership('ownerA', 'A', CasinoRole.OWNER);
    await addMembership('ghost', 'A', CasinoRole.FLOOR); // a member whose account was deleted
    await addMembership('ownerB', 'B', CasinoRole.OWNER);
    await addMembership('ownerA', 'DELETED', CasinoRole.OWNER);
  });

  afterAll(async () => {
    await app?.close();
  });

  // ------------------------------------------------------------ the matrix
  // label, actor, method, casino, path suffix, body, expected status
  const matrix: [string, Actor, Method, CasinoKey, string, unknown, number][] =
    [
      // ---- list: FLOOR and above
      ['list: anonymous', 'anonymous', 'get', 'A', '', undefined, 401],
      [
        'list: plain user (not a member)',
        'plain',
        'get',
        'A',
        '',
        undefined,
        404,
      ],
      ['list: FLOOR of A', 'floorA', 'get', 'A', '', undefined, 200],
      ['list: OWNER of A', 'ownerA', 'get', 'A', '', undefined, 200],
      [
        'list: OWNER of B on casino A',
        'ownerB',
        'get',
        'A',
        '',
        undefined,
        404,
      ],
      [
        'list: FLOOR of A on casino B',
        'floorA',
        'get',
        'B',
        '',
        undefined,
        404,
      ],
      ['list: admin', 'admin', 'get', 'A', '', undefined, 200],
      [
        'list: admin on a casino with no member',
        'admin',
        'get',
        'EMPTY',
        '',
        undefined,
        200,
      ],
      [
        'list: admin on an unknown casino',
        'admin',
        'get',
        'UNKNOWN',
        '',
        undefined,
        404,
      ],
      [
        'list: OWNER on a deleted casino (even its own)',
        'ownerA',
        'get',
        'DELETED',
        '',
        undefined,
        404,
      ],
      [
        'list: admin on a deleted casino',
        'admin',
        'get',
        'DELETED',
        '',
        undefined,
        404,
      ],
      [
        'list: malformed casino id',
        'ownerA',
        'get',
        'MALFORMED',
        '',
        undefined,
        404,
      ],

      // ---- add a FLOOR member: OWNER or ADMIN
      ['add FLOOR: anonymous', 'anonymous', 'post', 'A', '', ADD_FLOOR, 401],
      ['add FLOOR: plain user', 'plain', 'post', 'A', '', ADD_FLOOR, 404],
      [
        'add FLOOR: FLOOR of A (member, role too low)',
        'floorA',
        'post',
        'A',
        '',
        ADD_FLOOR,
        403,
      ],
      ['add FLOOR: OWNER of A', 'ownerA', 'post', 'A', '', ADD_FLOOR, 201],
      [
        'add FLOOR: OWNER of B on casino A',
        'ownerB',
        'post',
        'A',
        '',
        ADD_FLOOR,
        404,
      ],
      [
        'add FLOOR: OWNER of A on casino B',
        'ownerA',
        'post',
        'B',
        '',
        ADD_FLOOR,
        404,
      ],
      ['add FLOOR: admin', 'admin', 'post', 'A', '', ADD_FLOOR, 201],
      [
        'add FLOOR: admin on an unknown casino',
        'admin',
        'post',
        'UNKNOWN',
        '',
        ADD_FLOOR,
        404,
      ],
      [
        'add FLOOR: OWNER on a deleted casino',
        'ownerA',
        'post',
        'DELETED',
        '',
        ADD_FLOOR,
        404,
      ],
      [
        'add FLOOR: admin on a deleted casino',
        'admin',
        'post',
        'DELETED',
        '',
        ADD_FLOOR,
        404,
      ],
      [
        'add FLOOR: malformed casino id',
        'ownerA',
        'post',
        'MALFORMED',
        '',
        ADD_FLOOR,
        404,
      ],

      // ---- add an OWNER: ADMIN only
      ['add OWNER: plain user', 'plain', 'post', 'A', '', ADD_OWNER, 404],
      ['add OWNER: FLOOR of A', 'floorA', 'post', 'A', '', ADD_OWNER, 403],
      [
        'add OWNER: OWNER of A (owners do not appoint owners)',
        'ownerA',
        'post',
        'A',
        '',
        ADD_OWNER,
        403,
      ],
      ['add OWNER: admin', 'admin', 'post', 'A', '', ADD_OWNER, 201],
      [
        'add OWNER: admin, first owner of an empty casino',
        'admin',
        'post',
        'EMPTY',
        '',
        ADD_OWNER,
        201,
      ],

      // ---- add: the person to add
      [
        'add: unknown pseudo (OWNER)',
        'ownerA',
        'post',
        'A',
        '',
        { pseudo: 'nobody', role: CasinoRole.FLOOR },
        404,
      ],
      [
        'add: unknown pseudo (admin)',
        'admin',
        'post',
        'A',
        '',
        { pseudo: 'nobody', role: CasinoRole.FLOOR },
        404,
      ],
      [
        'add: deleted account',
        'ownerA',
        'post',
        'A',
        '',
        { pseudo: 'ghost', role: CasinoRole.FLOOR },
        404,
      ],
      [
        'add: already a member (FLOOR)',
        'ownerA',
        'post',
        'A',
        '',
        { pseudo: 'floora', role: CasinoRole.FLOOR },
        409,
      ],
      [
        'add: already a member (OWNER, by admin)',
        'admin',
        'post',
        'A',
        '',
        { pseudo: 'ownera', role: CasinoRole.FLOOR },
        409,
      ],

      // ---- change role: ADMIN only (the global roles guard answers 403 before the casino check)
      [
        'change role: anonymous',
        'anonymous',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        401,
      ],
      [
        'change role: plain user',
        'plain',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        403,
      ],
      [
        'change role: FLOOR of A',
        'floorA',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        403,
      ],
      [
        'change role: OWNER of A',
        'ownerA',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        403,
      ],
      [
        'change role: OWNER of B',
        'ownerB',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        403,
      ],
      [
        'promote FLOOR -> OWNER: admin',
        'admin',
        'patch',
        'A',
        '/floora',
        PROMOTE,
        200,
      ],
      [
        'demote OWNER -> FLOOR: admin',
        'admin',
        'patch',
        'A',
        '/ownera',
        DEMOTE,
        200,
      ],
      [
        'change role: admin on an unknown casino',
        'admin',
        'patch',
        'UNKNOWN',
        '/floora',
        PROMOTE,
        404,
      ],
      [
        'change role: admin on a deleted casino',
        'admin',
        'patch',
        'DELETED',
        '/ownera',
        DEMOTE,
        404,
      ],
      [
        'change role: admin, user who is not a member',
        'admin',
        'patch',
        'A',
        '/newbie',
        PROMOTE,
        404,
      ],
      [
        'change role: admin, member of ANOTHER casino',
        'admin',
        'patch',
        'B',
        '/floora',
        PROMOTE,
        404,
      ],
      [
        'change role: admin, unknown pseudo',
        'admin',
        'patch',
        'A',
        '/nobody',
        PROMOTE,
        404,
      ],
      [
        'change role: admin, deleted account',
        'admin',
        'patch',
        'A',
        '/ghost',
        PROMOTE,
        404,
      ],

      // ---- remove: OWNER removes FLOOR, ADMIN removes either
      [
        'remove: anonymous',
        'anonymous',
        'delete',
        'A',
        '/floora',
        undefined,
        401,
      ],
      ['remove: plain user', 'plain', 'delete', 'A', '/floora', undefined, 404],
      [
        'remove: FLOOR of A',
        'floorA',
        'delete',
        'A',
        '/floora',
        undefined,
        403,
      ],
      [
        'remove FLOOR: OWNER of A',
        'ownerA',
        'delete',
        'A',
        '/floora',
        undefined,
        204,
      ],
      [
        'remove FLOOR: OWNER of B on casino A',
        'ownerB',
        'delete',
        'A',
        '/floora',
        undefined,
        404,
      ],
      [
        'remove FLOOR: admin',
        'admin',
        'delete',
        'A',
        '/floora',
        undefined,
        204,
      ],
      [
        'remove OWNER: OWNER of A (an owner cannot remove an owner, nor leave)',
        'ownerA',
        'delete',
        'A',
        '/ownera',
        undefined,
        403,
      ],
      [
        'remove OWNER: admin',
        'admin',
        'delete',
        'A',
        '/ownera',
        undefined,
        204,
      ],
      [
        'remove: OWNER on a deleted casino',
        'ownerA',
        'delete',
        'DELETED',
        '/ownera',
        undefined,
        404,
      ],
      [
        'remove: admin on an unknown casino',
        'admin',
        'delete',
        'UNKNOWN',
        '/floora',
        undefined,
        404,
      ],
      [
        'remove: user who is not a member',
        'ownerA',
        'delete',
        'A',
        '/newbie',
        undefined,
        404,
      ],
      [
        'remove: unknown pseudo',
        'ownerA',
        'delete',
        'A',
        '/nobody',
        undefined,
        404,
      ],
      [
        'remove: deleted account',
        'ownerA',
        'delete',
        'A',
        '/ghost',
        undefined,
        404,
      ],
    ];

  it.each(
    matrix.map(([label, actor, method, casino, suffix, body, status]) => ({
      label,
      actor,
      method,
      casino,
      suffix,
      body,
      status,
    })),
  )(
    '$label -> $status',
    async ({ actor, method, casino, suffix, body, status }) => {
      await send(actor, method, url(casino, suffix), body).expect(status);
    },
  );

  // ----------------------------------------------------------- what comes out
  describe('responses: exact keys, nothing private', () => {
    it('list: every item is exactly { pseudo, role }, ordered by pseudo, deleted users hidden', async () => {
      const res = await send('ownerA', 'get', url('A')).expect(200);

      for (const item of res.body)
        expect(Object.keys(item).sort()).toEqual(['pseudo', 'role']);
      expect(res.body).toEqual([
        { pseudo: 'floora', role: CasinoRole.FLOOR },
        { pseudo: 'ownera', role: CasinoRole.OWNER },
      ]);
    });

    it('list: never contains an email, a name, an id, a hash or the global role', async () => {
      const res = await send('floorA', 'get', url('A')).expect(200);
      const text = JSON.stringify(res.body);

      expect(text).not.toMatch(
        /@example\.com|Test|Person|argon2|passwordHash|createdAt|"id"|ADMIN|USER/,
      );
      expect(text).not.toContain(userIds.ownerA);
    });

    it('list: an empty casino gives an empty list', async () => {
      const res = await send('admin', 'get', url('EMPTY')).expect(200);
      expect(res.body).toEqual([]);
    });

    it('list: shows only the members of THIS casino', async () => {
      const res = await send('ownerB', 'get', url('B')).expect(200);
      expect(res.body).toEqual([{ pseudo: 'ownerb', role: CasinoRole.OWNER }]);
    });

    it('add: returns exactly { pseudo, role }', async () => {
      const res = await send('ownerA', 'post', url('A'), ADD_FLOOR).expect(201);

      expect(res.body).toEqual({ pseudo: 'newbie', role: CasinoRole.FLOOR });
    });

    it('change role: returns exactly { pseudo, role }', async () => {
      const res = await send(
        'admin',
        'patch',
        url('A', '/floora'),
        PROMOTE,
      ).expect(200);

      expect(res.body).toEqual({ pseudo: 'floora', role: CasinoRole.OWNER });
    });

    it('remove: 204 with an empty body', async () => {
      const res = await send('ownerA', 'delete', url('A', '/floora')).expect(
        204,
      );
      expect(res.text).toBe('');
    });
  });

  // ---------------------------------------------------------- database effects
  describe('what the successful calls change', () => {
    it('add: creates ONE membership, with the requested role, in THIS casino only', async () => {
      const before = await prisma.membership.count();

      await send('ownerA', 'post', url('A'), ADD_FLOOR).expect(201);

      expect(await roleOf('newbie', 'A')).toBe(CasinoRole.FLOOR);
      expect(await prisma.membership.count()).toBe(before + 1);
      expect(await roleOf('newbie', 'B')).toBeNull();
    });

    it('pseudo is case-insensitive in the body: "NEWBIE" is the same person', async () => {
      await send('ownerA', 'post', url('A'), {
        pseudo: '  NEWBIE ',
        role: CasinoRole.FLOOR,
      }).expect(201);

      expect(await roleOf('newbie', 'A')).toBe(CasinoRole.FLOOR);
    });

    it('pseudo is case-insensitive in the URL too (/members/FLOORA)', async () => {
      await send('ownerA', 'delete', url('A', '/FLOORA')).expect(204);

      expect(await roleOf('floorA', 'A')).toBeNull();
    });

    it('change role: updates only that membership', async () => {
      await send('admin', 'patch', url('A', '/floora'), PROMOTE).expect(200);

      expect(await roleOf('floorA', 'A')).toBe(CasinoRole.OWNER);
      expect(await roleOf('ownerA', 'A')).toBe(CasinoRole.OWNER);
      expect(await roleOf('ownerB', 'B')).toBe(CasinoRole.OWNER);
    });

    it('remove: deletes only that membership, and the user is NOT deleted', async () => {
      await send('ownerA', 'delete', url('A', '/floora')).expect(204);

      expect(await roleOf('floorA', 'A')).toBeNull();
      expect(await roleOf('ownerA', 'A')).toBe(CasinoRole.OWNER);
      expect(
        await prisma.user.findUnique({ where: { id: userIds.floorA } }),
      ).not.toBeNull();
    });

    it('a deleted account stays out of the list but its membership row is untouched', async () => {
      const res = await send('ownerA', 'get', url('A')).expect(200);

      expect(res.body.map((m: { pseudo: string }) => m.pseudo)).not.toContain(
        'ghost',
      );
      expect(await roleOf('ghost', 'A')).toBe(CasinoRole.FLOOR);
    });
  });

  // --------------------------------------------------- privilege escalation
  describe('privilege escalation attempts change NOTHING', () => {
    it('an OWNER cannot appoint an OWNER', async () => {
      await send('ownerA', 'post', url('A'), ADD_OWNER).expect(403);

      expect(await roleOf('newbie', 'A')).toBeNull();
    });

    it('an OWNER cannot promote a FLOOR member', async () => {
      await send('ownerA', 'patch', url('A', '/floora'), PROMOTE).expect(403);

      expect(await roleOf('floorA', 'A')).toBe(CasinoRole.FLOOR);
    });

    it('an OWNER cannot demote or remove an OWNER, themself included', async () => {
      await send('ownerA', 'patch', url('A', '/ownera'), DEMOTE).expect(403);
      await send('ownerA', 'delete', url('A', '/ownera')).expect(403);

      expect(await roleOf('ownerA', 'A')).toBe(CasinoRole.OWNER);
    });

    it('a FLOOR member cannot add, promote or remove anybody', async () => {
      await send('floorA', 'post', url('A'), ADD_FLOOR).expect(403);
      await send('floorA', 'patch', url('A', '/floora'), PROMOTE).expect(403);
      await send('floorA', 'delete', url('A', '/ownera')).expect(403);

      expect(await roleOf('newbie', 'A')).toBeNull();
      expect(await roleOf('floorA', 'A')).toBe(CasinoRole.FLOOR);
      expect(await roleOf('ownerA', 'A')).toBe(CasinoRole.OWNER);
    });

    it('an OWNER of A cannot put themself into casino B', async () => {
      await send('ownerA', 'post', url('B'), {
        pseudo: 'ownera',
        role: CasinoRole.FLOOR,
      }).expect(404);

      expect(await roleOf('ownerA', 'B')).toBeNull();
    });

    it('an OWNER of A cannot touch the members of casino B', async () => {
      await send('ownerA', 'delete', url('B', '/ownerb')).expect(404);

      expect(await roleOf('ownerB', 'B')).toBe(CasinoRole.OWNER);
    });

    it('nobody changes their own role, an admin included', async () => {
      await addMembership('admin', 'A', CasinoRole.FLOOR);

      await send('admin', 'patch', url('A', '/admin'), PROMOTE).expect(403);

      expect(await roleOf('admin', 'A')).toBe(CasinoRole.FLOOR);
    });

    it('the 403 does not say which role is required', async () => {
      const res = await send('ownerA', 'post', url('A'), ADD_OWNER).expect(403);

      expect(JSON.stringify(res.body)).not.toMatch(/owner|floor|admin|role/i);
    });
  });

  // ------------------------------------------------------------- bad input
  describe('invalid input -> 400 and nothing is written', () => {
    const badAdd: [string, unknown][] = [
      ['empty body', {}],
      ['missing role', { pseudo: 'newbie' }],
      ['missing pseudo', { role: CasinoRole.FLOOR }],
      ['the global ADMIN role', { pseudo: 'newbie', role: 'ADMIN' }],
      ['the global USER role', { pseudo: 'newbie', role: 'USER' }],
      ['a lowercase role', { pseudo: 'newbie', role: 'floor' }],
      ['a role that does not exist', { pseudo: 'newbie', role: 'STAFF' }],
      ['a pseudo with a space', { pseudo: 'new bie', role: CasinoRole.FLOOR }],
      [
        'an email instead of a pseudo',
        { pseudo: 'newbie@example.com', role: CasinoRole.FLOOR },
      ],
      [
        'a pseudo far too long',
        { pseudo: 'a'.repeat(100), role: CasinoRole.FLOOR },
      ],
      ['a smuggled userId', { ...ADD_FLOOR, userId: userIds?.plain ?? 'x' }],
      ['a smuggled casinoId', { ...ADD_FLOOR, casinoId: 'another-casino' }],
      ['a smuggled membership id', { ...ADD_FLOOR, id: 'chosen-id' }],
      ['a smuggled deletedAt', { ...ADD_FLOOR, deletedAt: null }],
    ];

    it.each(badAdd.map(([label, body]) => ({ label, body })))(
      'add: $label',
      async ({ body }) => {
        const before = await countMembers('A');

        await send('ownerA', 'post', url('A'), body).expect(400);

        expect(await countMembers('A')).toBe(before);
      },
    );

    const badChange: [string, unknown][] = [
      ['empty body', {}],
      ['the global ADMIN role', { role: 'ADMIN' }],
      ['role set to null', { role: null }],
      [
        'a pseudo in the body (it comes from the URL)',
        { role: CasinoRole.OWNER, pseudo: 'ownera' },
      ],
      ['a smuggled userId', { role: CasinoRole.OWNER, userId: 'x' }],
    ];

    it.each(badChange.map(([label, body]) => ({ label, body })))(
      'change role: $label',
      async ({ body }) => {
        await send('admin', 'patch', url('A', '/floora'), body).expect(400);

        expect(await roleOf('floorA', 'A')).toBe(CasinoRole.FLOOR);
      },
    );
  });

  // ---------------------------------------------------------- nothing revealed
  describe('the 404s reveal nothing', () => {
    it('every "not found" has the SAME bare body, whatever the reason', async () => {
      const responses = await Promise.all([
        send('ownerA', 'post', url('A'), {
          pseudo: 'nobody',
          role: CasinoRole.FLOOR,
        }), // add: unknown pseudo
        send('ownerA', 'post', url('A'), {
          pseudo: 'ghost',
          role: CasinoRole.FLOOR,
        }), // add: deleted account
        send('ownerA', 'delete', url('A', '/newbie')), // remove: not a member
        send('ownerA', 'delete', url('A', '/nobody')), // remove: unknown pseudo
        send('ownerA', 'delete', url('A', '/ghost')), // remove: deleted account
        send('plain', 'get', url('A')), // list: not a member
        send('ownerA', 'get', url('DELETED')), // list: deleted casino
        send('admin', 'get', url('UNKNOWN')), // list: unknown casino
        send('admin', 'patch', url('A', '/newbie'), PROMOTE), // change: not a member
      ]);

      for (const res of responses) expect(res.status).toBe(404);
      for (const res of responses)
        expect(res.body).toEqual(new NotFoundException().getResponse());
    });
  });

  // --------------------------------------------------------------- concurrency
  describe('concurrency', () => {
    it('two simultaneous adds of the same person: exactly one 201 and one 409, one membership', async () => {
      const results = await Promise.all([
        send('ownerA', 'post', url('A'), ADD_FLOOR),
        send('admin', 'post', url('A'), ADD_FLOOR),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        await prisma.membership.count({
          where: { userId: userIds.newbie, casinoId: casinoIds.A },
        }),
      ).toBe(1);
    });
  });

  // ------------------------------------- the database decides, on every request
  describe('permissions are read from the database on every request', () => {
    it('a member promoted in the database gains the OWNER powers at once, with the SAME cookie', async () => {
      await send('floorA', 'post', url('A'), ADD_FLOOR).expect(403);

      await prisma.membership.update({
        where: {
          userId_casinoId: { userId: userIds.floorA, casinoId: casinoIds.A },
        },
        data: { role: CasinoRole.OWNER },
      });

      await send('floorA', 'post', url('A'), ADD_FLOOR).expect(201);
    });

    it('an OWNER demoted in the database loses the OWNER powers at once', async () => {
      await send('ownerA', 'post', url('A'), ADD_FLOOR).expect(201);

      await prisma.membership.update({
        where: {
          userId_casinoId: { userId: userIds.ownerA, casinoId: casinoIds.A },
        },
        data: { role: CasinoRole.FLOOR },
      });

      await send('ownerA', 'delete', url('A', '/newbie')).expect(403);
    });

    it('a member removed through the API loses ALL access at once (list becomes 404)', async () => {
      await send('floorA', 'get', url('A')).expect(200);

      await send('ownerA', 'delete', url('A', '/floora')).expect(204);

      await send('floorA', 'get', url('A')).expect(404);
    });

    it('a member added through the API gains access at once, with the cookie they already had', async () => {
      await send('newbie', 'get', url('A')).expect(404);

      await send('ownerA', 'post', url('A'), ADD_FLOOR).expect(201);

      await send('newbie', 'get', url('A')).expect(200);
    });

    it('casino deleted after login: every member route becomes 404, even for its former owner', async () => {
      await send('ownerA', 'get', url('A')).expect(200);

      await prisma.casino.update({
        where: { id: casinoIds.A },
        data: { deletedAt: new Date() },
      });

      await send('ownerA', 'get', url('A')).expect(404);
      await send('ownerA', 'post', url('A'), ADD_FLOOR).expect(404);
      await send('ownerA', 'delete', url('A', '/floora')).expect(404);
    });
  });

  // ---------------------------------------------- the whole chain, end to end
  describe('appointing the first owner of a new casino', () => {
    it('an admin appoints an owner, who can then run the casino and add staff, with a cookie issued BEFORE', async () => {
      // newbie logged in at the start of the suite: they were nobody then
      await agents.newbie
        .patch(`/api/casinos/${casinoIds.EMPTY}`)
        .send({ city: 'Geneva' })
        .expect(404);

      await send('admin', 'post', url('EMPTY'), ADD_OWNER).expect(201);

      await agents.newbie
        .patch(`/api/casinos/${casinoIds.EMPTY}`)
        .send({ city: 'Geneva' })
        .expect(200);
      await send('newbie', 'post', url('EMPTY'), {
        pseudo: 'plain',
        role: CasinoRole.FLOOR,
      }).expect(201);
      await send('newbie', 'post', url('EMPTY'), {
        pseudo: 'floora',
        role: CasinoRole.OWNER,
      }).expect(403);
    });
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CasinoRole, Role } from '../src/generated/prisma/client';

/*
 * Casino routes end to end, behind the REAL global guards (throttler, auth, roles):
 *   POST   /api/casinos               ADMIN only                 -> admin view (201)
 *   GET    /api/casinos               any logged-in user         -> public view, active casinos only
 *   GET    /api/casinos/:casinoId     any logged-in user         -> public view
 *   PATCH  /api/casinos/:casinoId     OWNER of that casino/ADMIN -> public view
 *
 * ASSUMPTIONS TO CHECK:
 *  - The routes and statuses above. Anonymous visitors get 401 everywhere.
 *  - MALFORMED_ID_STATUS: what GET /casinos/not-a-uuid answers. 404 if you dropped ParseUUIDPipe
 *    (my recommendation: one status for every unknown id), 400 if you kept it. On PATCH it is ALWAYS 404:
 *    the casino guard runs before pipes and answers 404 for an id that matches nothing.
 *  - MAX_PAGE_SIZE: the hard cap of the list. Delete the "cap" test if you did not paginate.
 *  - Public view: id, name, city, address. Admin view: + createdAt, updatedAt, deletedAt.
 *  - THROTTLE_DISABLED=true comes from test/setup-env.ts.
 *  - Run against a TEST database: beforeEach wipes Membership, User and Casino
 *    (if other specs leave PokerTable rows, delete them first: onDelete Restrict).
 */

const MALFORMED_ID_STATUS = 404;
const MAX_PAGE_SIZE = 50;

const PUBLIC_KEYS = ['address', 'city', 'id', 'name'];
const ADMIN_KEYS = ['address', 'city', 'createdAt', 'deletedAt', 'id', 'name', 'updatedAt'];

const NEW_CASINO = { name: 'Casino Nouveau', city: 'Geneva', address: 'Quai du Mont-Blanc 1' };
const PATCH_BODY = { city: 'Neuchatel' };

type Actor = 'anonymous' | 'plain' | 'floorA' | 'ownerA' | 'ownerB' | 'admin';
type LoggedActor = Exclude<Actor, 'anonymous'>;
type CasinoKey = 'A' | 'B' | 'DELETED' | 'UNKNOWN' | 'MALFORMED';
type Method = 'get' | 'post' | 'patch';
type Caller = Record<Method, (path: string) => request.Test>;

describe('Casino routes (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const PASSWORD = 'Correct-Horse-9-Battery!';
    const PEOPLE: Record<LoggedActor, { pseudo: string; email: string }> = {
        plain: { pseudo: 'plain', email: 'plain@example.com' },
        floorA: { pseudo: 'floora', email: 'floora@example.com' },
        ownerA: { pseudo: 'ownera', email: 'ownera@example.com' },
        ownerB: { pseudo: 'ownerb', email: 'ownerb@example.com' },
        admin: { pseudo: 'admin', email: 'admin@example.com' },
    };

    const userIds = {} as Record<LoggedActor, string>;
    const casinoIds = {} as Record<CasinoKey, string>;
    const agents = {} as Record<LoggedActor, ReturnType<typeof request.agent>>;
    const membershipIds = {} as Record<'floorA' | 'ownerA', string>;

    const server = () => app.getHttpServer();

    // ---------------------------------------------------------------- helpers
    const caller = (actor: Actor) =>
        (actor === 'anonymous' ? request(server()) : agents[actor]) as unknown as Caller;

    const send = (actor: Actor, method: Method, path: string, body?: unknown) => {
        const req = caller(actor)[method](path);
        return body === undefined ? req : req.send(body as object);
    };

    const pathFor = (casino: CasinoKey | null) =>
        casino === null ? '/api/casinos' : `/api/casinos/${casinoIds[casino]}`;

    const register = async (u: { pseudo: string; email: string }) => {
        const res = await request(server())
            .post('/api/auth/register')
            .send({ firstName: 'Test', lastName: 'Person', birthDate: '1990-01-01', password: PASSWORD, ...u })
            .expect(201);
        return res.body.id as string;
    };

    const loggedInAgent = async (email: string) => {
        const agent = request.agent(server());
        await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
        return agent;
    };

    const newCasino = (name: string, deleted = false) =>
        prisma.casino.create({
            data: { name, city: 'Lausanne', address: 'Rue du Test 1', deletedAt: deleted ? new Date() : null },
        });

    const row = (id: string) => prisma.casino.findUniqueOrThrow({ where: { id } });

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();

        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await prisma.membership.deleteMany();
        await prisma.user.deleteMany();
        await prisma.casino.deleteMany();

        for (const actor of Object.keys(PEOPLE) as LoggedActor[]) {
            userIds[actor] = await register(PEOPLE[actor]);
        }
        await prisma.user.update({ where: { id: userIds.admin }, data: { role: Role.ADMIN } });

        casinoIds.A = (await newCasino('Casino A')).id;
        casinoIds.B = (await newCasino('Casino B')).id;
        casinoIds.DELETED = (await newCasino('Casino Deleted', true)).id;
        casinoIds.UNKNOWN = randomUUID();
        casinoIds.MALFORMED = 'not-a-uuid';

        membershipIds.floorA = (await prisma.membership.create({
            data: { userId: userIds.floorA, casinoId: casinoIds.A, role: CasinoRole.FLOOR },
        })).id;
        membershipIds.ownerA = (await prisma.membership.create({
            data: { userId: userIds.ownerA, casinoId: casinoIds.A, role: CasinoRole.OWNER },
        })).id;
        await prisma.membership.create({
            data: { userId: userIds.ownerB, casinoId: casinoIds.B, role: CasinoRole.OWNER },
        });
        // ownerA also owns the deleted casino: being its owner must not help
        await prisma.membership.create({
            data: { userId: userIds.ownerA, casinoId: casinoIds.DELETED, role: CasinoRole.OWNER },
        });

        for (const actor of Object.keys(PEOPLE) as LoggedActor[]) {
            agents[actor] = await loggedInAgent(PEOPLE[actor].email);
        }
    });

    afterAll(async () => {
        await app.close();
    });

    // ------------------------------------------------------------ the matrix
    // label, actor, method, casino in the path (null = collection), body, expected status
    const matrix: [string, Actor, Method, CasinoKey | null, unknown, number][] = [
        // create: ADMIN only. Even the owner of a casino cannot create casinos.
        ['create: anonymous', 'anonymous', 'post', null, NEW_CASINO, 401],
        ['create: plain user', 'plain', 'post', null, NEW_CASINO, 403],
        ['create: FLOOR of A', 'floorA', 'post', null, NEW_CASINO, 403],
        ['create: OWNER of A', 'ownerA', 'post', null, NEW_CASINO, 403],
        ['create: admin', 'admin', 'post', null, NEW_CASINO, 201],

        // list: any logged-in user
        ['list: anonymous', 'anonymous', 'get', null, undefined, 401],
        ['list: plain user', 'plain', 'get', null, undefined, 200],
        ['list: FLOOR of A', 'floorA', 'get', null, undefined, 200],
        ['list: admin', 'admin', 'get', null, undefined, 200],

        // read one: any logged-in user, active casinos only
        ['read A: anonymous', 'anonymous', 'get', 'A', undefined, 401],
        ['read A: plain user', 'plain', 'get', 'A', undefined, 200],
        ['read B: plain user', 'plain', 'get', 'B', undefined, 200],
        ['read DELETED: plain user', 'plain', 'get', 'DELETED', undefined, 404],
        ['read DELETED: its own owner', 'ownerA', 'get', 'DELETED', undefined, 404],
        ['read DELETED: admin', 'admin', 'get', 'DELETED', undefined, 404],
        ['read UNKNOWN: plain user', 'plain', 'get', 'UNKNOWN', undefined, 404],
        ['read MALFORMED id: plain user', 'plain', 'get', 'MALFORMED', undefined, MALFORMED_ID_STATUS],

        // update: OWNER of that casino, or admin
        ['update A: anonymous', 'anonymous', 'patch', 'A', PATCH_BODY, 401],
        ['update A: plain user (not a member)', 'plain', 'patch', 'A', PATCH_BODY, 404],
        ['update A: FLOOR of A (member, role too low)', 'floorA', 'patch', 'A', PATCH_BODY, 403],
        ['update B: FLOOR of A (another casino)', 'floorA', 'patch', 'B', PATCH_BODY, 404],
        ['update A: OWNER of A', 'ownerA', 'patch', 'A', PATCH_BODY, 200],
        ['update B: OWNER of A (another casino)', 'ownerA', 'patch', 'B', PATCH_BODY, 404],
        ['update A: OWNER of B (another casino)', 'ownerB', 'patch', 'A', PATCH_BODY, 404],
        ['update A: admin', 'admin', 'patch', 'A', PATCH_BODY, 200],
        ['update B: admin', 'admin', 'patch', 'B', PATCH_BODY, 200],
        ['update DELETED: its own owner', 'ownerA', 'patch', 'DELETED', PATCH_BODY, 404],
        ['update DELETED: admin', 'admin', 'patch', 'DELETED', PATCH_BODY, 404],
        ['update UNKNOWN: OWNER of A', 'ownerA', 'patch', 'UNKNOWN', PATCH_BODY, 404],
        ['update UNKNOWN: admin', 'admin', 'patch', 'UNKNOWN', PATCH_BODY, 404],
        ['update MALFORMED id: OWNER of A (the guard answers before any pipe)', 'ownerA', 'patch', 'MALFORMED', PATCH_BODY, 404],
        ['update MALFORMED id: admin', 'admin', 'patch', 'MALFORMED', PATCH_BODY, 404],
    ];

    it.each(matrix)('%s -> %i', async (_label, actor, method, casino, body, status) => {
        await send(actor, method, pathFor(casino), body).expect(status);
    });

    // ----------------------------------------------------------- what comes out
    describe('responses: exact keys, nothing private', () => {
        it('list: every item has exactly the public keys', async () => {
            const res = await send('plain', 'get', pathFor(null)).expect(200);

            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            for (const item of res.body) expect(Object.keys(item).sort()).toEqual(PUBLIC_KEYS);
        });

        it('read: exactly the public keys, and the right values', async () => {
            const res = await send('plain', 'get', pathFor('A')).expect(200);

            expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
            expect(res.body).toMatchObject({ id: casinoIds.A, name: 'Casino A' });
        });

        it('update: exactly the public keys', async () => {
            const res = await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(200);

            expect(Object.keys(res.body).sort()).toEqual(PUBLIC_KEYS);
            expect(res.body.city).toBe(PATCH_BODY.city);
        });

        it('create: the ADMIN view (public fields + createdAt, updatedAt, deletedAt)', async () => {
            const res = await send('admin', 'post', pathFor(null), NEW_CASINO).expect(201);

            expect(Object.keys(res.body).sort()).toEqual(ADMIN_KEYS);
            expect(res.body.deletedAt).toBeNull();
        });

        it('no public response ever contains deletedAt, timestamps, memberships or user data', async () => {
            const responses = [
                await send('plain', 'get', pathFor(null)).expect(200),
                await send('plain', 'get', pathFor('A')).expect(200),
                await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(200),
            ];

            for (const res of responses) {
                const text = JSON.stringify(res.body);
                expect(text).not.toMatch(/deletedAt|createdAt|updatedAt|memberships|passwordHash|argon2/);
                expect(text).not.toContain(PEOPLE.ownerA.email);
            }
        });
    });

    // ------------------------------------------------------------------- list
    describe('GET /api/casinos', () => {
        it('shows active casinos and hides the deleted one', async () => {
            const res = await send('plain', 'get', pathFor(null)).expect(200);
            const ids = res.body.map((c: { id: string }) => c.id);

            expect(ids).toContain(casinoIds.A);
            expect(ids).toContain(casinoIds.B);
            expect(ids).not.toContain(casinoIds.DELETED);
        });

        it('is ordered by name, whatever the insertion order', async () => {
            await prisma.membership.deleteMany();
            await prisma.casino.deleteMany();
            await newCasino('Zeta');
            await newCasino('Alpha');
            await newCasino('Alpha'); // same name twice: the id breaks the tie
            await newCasino('Mu');

            const res = await send('plain', 'get', pathFor(null)).expect(200);

            expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Alpha', 'Alpha', 'Mu', 'Zeta']);
        });

        it('is stable: two calls return the same order', async () => {
            await prisma.casino.createMany({
                data: Array.from({ length: 6 }, () => ({ name: 'Same Name', city: 'Lausanne', address: 'Rue 1' })),
            });

            const first = await send('plain', 'get', pathFor(null)).expect(200);
            const second = await send('plain', 'get', pathFor(null)).expect(200);

            expect(second.body).toEqual(first.body);
        });

        it('never returns more than the maximum page size (delete this test if you did not paginate)', async () => {
            await prisma.casino.createMany({
                data: Array.from({ length: MAX_PAGE_SIZE + 5 }, (_, i) => ({
                    name: `Bulk ${String(i).padStart(3, '0')}`,
                    city: 'Lausanne',
                    address: 'Rue 1',
                })),
            });

            const res = await send('plain', 'get', pathFor(null)).expect(200);

            expect(res.body.length).toBeGreaterThan(0);
            expect(res.body.length).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        });
    });

    // ----------------------------------------------------------------- create
    describe('POST /api/casinos', () => {
        it('stores the casino, trimmed, and returns it', async () => {
            const res = await send('admin', 'post', pathFor(null), {
                name: '  Padded Name  ',
                city: ' Bern ',
                address: '  Rue 1  ',
            }).expect(201);

            expect(res.body).toMatchObject({ name: 'Padded Name', city: 'Bern', address: 'Rue 1' });

            const stored = await row(res.body.id);
            expect(stored).toMatchObject({ name: 'Padded Name', city: 'Bern', address: 'Rue 1', deletedAt: null });
        });

        it('a new casino starts with NO member: the creating admin does not become staff', async () => {
            const res = await send('admin', 'post', pathFor(null), NEW_CASINO).expect(201);

            expect(await prisma.membership.count({ where: { casinoId: res.body.id } })).toBe(0);
        });

        it('nobody but an admin can then manage it (no owner yet)', async () => {
            const res = await send('admin', 'post', pathFor(null), NEW_CASINO).expect(201);
            const path = `/api/casinos/${res.body.id}`;

            await agents.ownerA.patch(path).send(PATCH_BODY).expect(404);
            await agents.admin.patch(path).send(PATCH_BODY).expect(200);
        });

        const badBodies: [string, unknown][] = [
            ['empty body', {}],
            ['missing name', { city: 'Bern', address: 'Rue 1' }],
            ['missing city', { name: 'X', address: 'Rue 1' }],
            ['missing address', { name: 'X', city: 'Bern' }],
            ['whitespace-only name', { ...NEW_CASINO, name: '    ' }],
            ['empty city', { ...NEW_CASINO, city: '' }],
            ['name far too long', { ...NEW_CASINO, name: 'a'.repeat(1000) }],
            ['name that is a number', { ...NEW_CASINO, name: 42 }],
            ['name that is an object', { ...NEW_CASINO, name: { x: 1 } }],
            ['client-chosen id', { ...NEW_CASINO, id: 'chosen-by-client' }],
            ['client-chosen deletedAt', { ...NEW_CASINO, deletedAt: null }],
            ['client-chosen timestamps', { ...NEW_CASINO, createdAt: '2020-01-01' }],
            ['members smuggled in', { ...NEW_CASINO, memberships: [{ userId: 'x', role: 'OWNER' }] }],
        ];

        it.each(badBodies)('%s -> 400 and nothing is created', async (_label, body) => {
            const before = await prisma.casino.count();

            await send('admin', 'post', pathFor(null), body).expect(400);

            expect(await prisma.casino.count()).toBe(before);
        });

        it('a forbidden caller creates nothing either', async () => {
            const before = await prisma.casino.count();

            await send('ownerA', 'post', pathFor(null), NEW_CASINO).expect(403);

            expect(await prisma.casino.count()).toBe(before);
        });
    });

    // ----------------------------------------------------------------- update
    describe('PATCH /api/casinos/:casinoId', () => {
        it('changes only the field that was sent', async () => {
            const before = await row(casinoIds.A);

            await send('ownerA', 'patch', pathFor('A'), { city: 'Geneva' }).expect(200);

            const after = await row(casinoIds.A);
            expect(after.city).toBe('Geneva');
            expect(after.name).toBe(before.name);
            expect(after.address).toBe(before.address);
            expect(after.deletedAt).toBeNull();
        });

        it('trims what it stores', async () => {
            await send('ownerA', 'patch', pathFor('A'), { name: '  Renamed  ' }).expect(200);

            expect((await row(casinoIds.A)).name).toBe('Renamed');
        });

        it('does not touch any other casino', async () => {
            const otherBefore = await row(casinoIds.B);

            await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(200);
            await send('admin', 'patch', pathFor('A'), { name: 'Admin Rename' }).expect(200);

            expect(await row(casinoIds.B)).toEqual(otherBefore);
        });

        it('a refused update leaves the row exactly as it was', async () => {
            const before = await row(casinoIds.A);

            await send('floorA', 'patch', pathFor('A'), PATCH_BODY).expect(403);
            await send('plain', 'patch', pathFor('A'), PATCH_BODY).expect(404);
            await send('ownerB', 'patch', pathFor('A'), PATCH_BODY).expect(404);

            expect(await row(casinoIds.A)).toEqual(before);
        });

        it('a deleted casino cannot be modified, and cannot be brought back', async () => {
            const before = await row(casinoIds.DELETED);

            await send('ownerA', 'patch', pathFor('DELETED'), PATCH_BODY).expect(404);
            await send('admin', 'patch', pathFor('DELETED'), { deletedAt: null }).expect(404); // 404 first: the guard answers before validation

            expect(await row(casinoIds.DELETED)).toEqual(before);
        });

        const badBodies: [string, unknown][] = [
            ['empty body', {}],
            ['whitespace-only city', { city: '   ' }],
            ['name set to null', { name: null }],
            ['name far too long', { name: 'a'.repeat(1000) }],
            ['id change', { id: 'another-id' }],
            ['"undelete" attempt', { deletedAt: null }],
            ['timestamp change', { updatedAt: '2020-01-01' }],
            ['valid field next to a forbidden one', { city: 'Geneva', id: 'another-id' }],
        ];

        it.each(badBodies)('%s -> 400 and the row is unchanged', async (_label, body) => {
            const before = await row(casinoIds.A);

            await send('ownerA', 'patch', pathFor('A'), body).expect(400);

            expect(await row(casinoIds.A)).toEqual(before);
        });
    });

    // ------------------------------------------------------ nothing is revealed
    describe('404s reveal nothing', () => {
        it('every "not found" has the SAME bare body, whatever the reason', async () => {
            const responses = await Promise.all([
                send('plain', 'get', pathFor('UNKNOWN')),              // read: unknown id
                send('plain', 'get', pathFor('DELETED')),              // read: deleted
                send('ownerA', 'patch', pathFor('UNKNOWN'), PATCH_BODY), // update: unknown id
                send('ownerA', 'patch', pathFor('DELETED'), PATCH_BODY), // update: deleted, even for its owner
                send('plain', 'patch', pathFor('A'), PATCH_BODY),        // update: exists, not a member
                send('ownerA', 'patch', pathFor('B'), PATCH_BODY),       // update: exists, member elsewhere
                send('admin', 'patch', pathFor('UNKNOWN'), PATCH_BODY),  // update: admin on an unknown id
            ]);

            for (const res of responses) expect(res.status).toBe(404);
            for (const res of responses) expect(res.body).toEqual(new NotFoundException().getResponse());
        });

        it('the 403 for a member with too low a role does not say which role is required', async () => {
            const res = await send('floorA', 'patch', pathFor('A'), PATCH_BODY).expect(403);

            expect(JSON.stringify(res.body)).not.toMatch(/owner|floor|role/i);
        });
    });

    // --------------------------------------------- the database decides, live
    describe('permissions are read from the database on every request', () => {
        it('promoted FLOOR -> OWNER: update goes from 403 to 200 with the SAME cookie', async () => {
            await send('floorA', 'patch', pathFor('A'), PATCH_BODY).expect(403);

            await prisma.membership.update({ where: { id: membershipIds.floorA }, data: { role: CasinoRole.OWNER } });

            await send('floorA', 'patch', pathFor('A'), PATCH_BODY).expect(200);
        });

        it('demoted OWNER -> FLOOR: update goes from 200 to 403', async () => {
            await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(200);

            await prisma.membership.update({ where: { id: membershipIds.ownerA }, data: { role: CasinoRole.FLOOR } });

            await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(403);
        });

        it('membership removed: update goes to 404, but READING stays open (it is public to logged-in users)', async () => {
            await prisma.membership.delete({ where: { id: membershipIds.ownerA } });

            await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(404);
            await send('ownerA', 'get', pathFor('A')).expect(200);
        });

        it('casino deleted after login: it disappears from list and read, and cannot be updated, at once', async () => {
            await send('ownerA', 'get', pathFor('A')).expect(200);

            await prisma.casino.update({ where: { id: casinoIds.A }, data: { deletedAt: new Date() } });

            await send('ownerA', 'get', pathFor('A')).expect(404);
            await send('ownerA', 'patch', pathFor('A'), PATCH_BODY).expect(404);
            const list = await send('ownerA', 'get', pathFor(null)).expect(200);
            expect(list.body.map((c: { id: string }) => c.id)).not.toContain(casinoIds.A);
        });
    });
});
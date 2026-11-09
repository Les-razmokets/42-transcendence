import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // adjust
import { configureApp } from '../src/app.config'; // or inline the same setup as in your other e2e specs
import { PrismaService } from '../src/prisma/prisma.service'; // adjust
import { CasinoRole, Role } from '../src/generated/prisma/client'; // value imports
import { NestExpressApplication } from '@nestjs/platform-express';

/*
 * GET /api/users/me now returns the usual "my profile" fields + an ALWAYS-PRESENT `memberships` list.
 *
 * ASSUMPTIONS TO CHECK:
 *  - Each membership is exactly { casinoId, casinoName, role }, only for ACTIVE casinos,
 *    ordered by casino name (then id).
 *  - Register and login keep the OLD schema (no `memberships`).
 *  - GET /users/:id is unchanged (public view only).
 *  - THROTTLE_DISABLED=true comes from test/setup-env.ts.
 *  - Run against a TEST database. Users are created ONCE (beforeAll); casinos and memberships
 *    are rebuilt before every test.
 *    (If other specs leave PokerTable rows, delete them first: Casino uses onDelete Restrict.)
 *
 * IN THE OLD users.me.e2e-spec.ts, TWO TESTS MUST CHANGE (see the message that came with this file):
 *   - "returns exactly the my profile keys": the expected keys now include 'memberships'.
 *   - "is the same view as the login response": compare after removing `memberships` from /me.
 */

const MY_PROFILE_KEYS = [
    'birthDate', 'createdAt', 'email', 'firstName', 'id',
    'lastName', 'phone', 'pseudo', 'role', 'updatedAt',
];
const ME_KEYS = [...MY_PROFILE_KEYS, 'memberships'].sort();
const MEMBERSHIP_KEYS = ['casinoId', 'casinoName', 'role'];

type Person = 'client' | 'floorA' | 'multi' | 'admin';
type CasinoKey = 'A' | 'B' | 'C' | 'DELETED';

describe('GET /api/users/me with memberships (e2e)', () => {
    let app: NestExpressApplication;
    let prisma: PrismaService;

    const PASSWORD = 'Correct-Horse-9-Battery!';
    const PEOPLE: Record<Person, { pseudo: string; email: string }> = {
        client: { pseudo: 'client', email: 'client@example.com' }, // no membership at all
        floorA: { pseudo: 'floora', email: 'floora@example.com' }, // FLOOR at Alpha
        multi: { pseudo: 'multi', email: 'multi@example.com' },    // OWNER at Alpha, FLOOR at Beta, OWNER of a deleted casino
        admin: { pseudo: 'admin', email: 'admin@example.com' },    // global admin, NO membership
    };

    const userIds = {} as Record<Person, string>;
    const casinoIds = {} as Record<CasinoKey, string>;
    const agents = {} as Record<Person, ReturnType<typeof request.agent>>;

    const server = () => app.getHttpServer();
    const me = (person: Person) => agents[person].get('/api/users/me');

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

    const addMembership = (person: Person, casino: CasinoKey, role: CasinoRole) =>
        prisma.membership.create({ data: { userId: userIds[person], casinoId: casinoIds[casino], role } });

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();

        prisma = app.get(PrismaService);

        await prisma.membership.deleteMany();
        await prisma.user.deleteMany();
        await prisma.casino.deleteMany();

        for (const person of Object.keys(PEOPLE) as Person[]) {
            userIds[person] = await register(PEOPLE[person]);
        }
        await prisma.user.update({ where: { id: userIds.admin }, data: { role: Role.ADMIN } });

        for (const person of Object.keys(PEOPLE) as Person[]) {
            agents[person] = await loggedInAgent(PEOPLE[person].email);
        }
    });

    beforeEach(async () => {
        await prisma.membership.deleteMany();
        await prisma.casino.deleteMany();

        casinoIds.A = (await newCasino('Alpha Casino')).id;
        casinoIds.B = (await newCasino('Beta Casino')).id;
        casinoIds.C = (await newCasino('Gamma Casino')).id;
        casinoIds.DELETED = (await newCasino('Zeta Deleted', true)).id;

        await addMembership('floorA', 'A', CasinoRole.FLOOR);
        // inserted in REVERSE name order on purpose: the list must come back sorted by casino name
        await addMembership('multi', 'B', CasinoRole.FLOOR);
        await addMembership('multi', 'A', CasinoRole.OWNER);
        await addMembership('multi', 'DELETED', CasinoRole.OWNER);
    });

    afterAll(async () => {
        await app?.close();
    });

    describe('the shape of the response', () => {
        it('has exactly the profile keys plus memberships', async () => {
            const res = await me('client').expect(200);

            expect(Object.keys(res.body).sort()).toEqual(ME_KEYS);
        });

        it('still never leaks the hash or deletedAt', async () => {
            const res = await me('multi').expect(200);

            expect(res.body).not.toHaveProperty('passwordHash');
            expect(res.body).not.toHaveProperty('deletedAt');
            expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|deletedAt/);
        });

        it('a client with no membership gets an EMPTY LIST, with the key present (never null or absent)', async () => {
            const res = await me('client').expect(200);

            expect(res.body).toHaveProperty('memberships');
            expect(Array.isArray(res.body.memberships)).toBe(true);
            expect(res.body.memberships).toEqual([]);
        });

        it('each membership is exactly { casinoId, casinoName, role }', async () => {
            const res = await me('multi').expect(200);

            expect(res.body.memberships.length).toBeGreaterThan(0);
            for (const m of res.body.memberships) expect(Object.keys(m).sort()).toEqual(MEMBERSHIP_KEYS);
        });
    });

    describe('what the list contains', () => {
        it('a FLOOR member sees their casino with the FLOOR role', async () => {
            const res = await me('floorA').expect(200);

            expect(res.body.memberships).toEqual([
                { casinoId: casinoIds.A, casinoName: 'Alpha Casino', role: CasinoRole.FLOOR },
            ]);
        });

        it('a user in several casinos sees all the active ones, sorted by casino name, with the right role in each', async () => {
            const res = await me('multi').expect(200);

            expect(res.body.memberships).toEqual([
                { casinoId: casinoIds.A, casinoName: 'Alpha Casino', role: CasinoRole.OWNER },
                { casinoId: casinoIds.B, casinoName: 'Beta Casino', role: CasinoRole.FLOOR },
            ]);
        });

        it('a membership in a DELETED casino does not appear', async () => {
            const res = await me('multi').expect(200);

            const ids = res.body.memberships.map((m: { casinoId: string }) => m.casinoId);
            expect(ids).not.toContain(casinoIds.DELETED);
            expect(JSON.stringify(res.body)).not.toContain('Zeta Deleted');
        });

        it('only MY memberships: another member of the same casino never shows up', async () => {
            const res = await me('multi').expect(200);
            const text = JSON.stringify(res.body);

            expect(text).not.toContain(PEOPLE.floorA.pseudo); // floora is also a member of Alpha
            expect(text).not.toContain(PEOPLE.floorA.email);
            expect(text).not.toContain(userIds.floorA);
        });

        it('casinos I am not a member of never show up', async () => {
            const res = await me('floorA').expect(200);
            const text = JSON.stringify(res.body);

            expect(text).not.toContain(casinoIds.B);
            expect(text).not.toContain('Beta Casino');
            expect(text).not.toContain('Gamma Casino');
        });

        it('a global ADMIN with no membership gets an empty list: the admin shortcut is not a membership', async () => {
            const res = await me('admin').expect(200);

            expect(res.body.role).toBe(Role.ADMIN);
            expect(res.body.memberships).toEqual([]);
        });

        it('exposes nothing else about the casino or the membership (no address, city, ids of the row, dates)', async () => {
            const res = await me('multi').expect(200);
            const text = JSON.stringify(res.body.memberships);

            expect(text).not.toMatch(/Rue du Test|Lausanne|createdAt|updatedAt|deletedAt|"id"|userId/);
        });
    });

    describe('the list follows the database on every request (same cookie, no new login)', () => {
        it('a membership added later appears at once', async () => {
            await me('client').expect(200).then((r) => expect(r.body.memberships).toEqual([]));

            await addMembership('client', 'C', CasinoRole.FLOOR);

            const res = await me('client').expect(200);
            expect(res.body.memberships).toEqual([
                { casinoId: casinoIds.C, casinoName: 'Gamma Casino', role: CasinoRole.FLOOR },
            ]);
        });

        it('a role change shows at once', async () => {
            await prisma.membership.update({
                where: { userId_casinoId: { userId: userIds.floorA, casinoId: casinoIds.A } },
                data: { role: CasinoRole.OWNER },
            });

            const res = await me('floorA').expect(200);
            expect(res.body.memberships[0].role).toBe(CasinoRole.OWNER);
        });

        it('a removed membership disappears at once', async () => {
            await prisma.membership.delete({
                where: { userId_casinoId: { userId: userIds.multi, casinoId: casinoIds.B } },
            });

            const res = await me('multi').expect(200);
            expect(res.body.memberships.map((m: { casinoName: string }) => m.casinoName)).toEqual(['Alpha Casino']);
        });

        it('a casino deleted later disappears from my list at once', async () => {
            await prisma.casino.update({ where: { id: casinoIds.A }, data: { deletedAt: new Date() } });

            const res = await me('floorA').expect(200);
            expect(res.body.memberships).toEqual([]);
        });

        it('a removal through the members API shows up on /me', async () => {
            await agents.admin.delete(`/api/casinos/${casinoIds.A}/members/floora`).expect(204);

            const res = await me('floorA').expect(200);
            expect(res.body.memberships).toEqual([]);
        });
    });

    describe('everything else is unchanged', () => {
        it('without a cookie it is still 401', async () => {
            await request(server()).get('/api/users/me').expect(401);
        });

        it('/users/me is still not swallowed by /users/:id', async () => {
            await me('client').expect(200);
        });

        it('register and login keep the OLD schema: no memberships key', async () => {
            const login = await request(server())
                .post('/api/auth/login')
                .send({ email: PEOPLE.multi.email, password: PASSWORD })
                .expect(200);

            expect(login.body).not.toHaveProperty('memberships');
            expect(Object.keys(login.body).sort()).toEqual([...MY_PROFILE_KEYS].sort());

            await prisma.user.deleteMany({ where: { email: 'fresh@example.com' } });
            const registered = await request(server())
                .post('/api/auth/register')
                .send({
                    firstName: 'Fresh', lastName: 'User', pseudo: 'fresh', email: 'fresh@example.com',
                    password: PASSWORD, birthDate: '1990-01-01',
                })
                .expect(201);

            expect(registered.body).not.toHaveProperty('memberships');
            expect(Object.keys(registered.body).sort()).toEqual([...MY_PROFILE_KEYS].sort());

            await prisma.user.deleteMany({ where: { email: 'fresh@example.com' } });
        });

        it('the profile part of /me equals the login response', async () => {
            const login = await request(server())
                .post('/api/auth/login')
                .send({ email: PEOPLE.multi.email, password: PASSWORD })
                .expect(200);

            const meRes = await me('multi').expect(200);
            const { memberships: _memberships, ...profile } = meRes.body;

            expect(profile).toEqual(login.body);
        });

        it('GET /users/:id still shows the public view only, no memberships', async () => {
            const res = await agents.client.get(`/api/users/${userIds.multi}`).expect(200);

            expect(Object.keys(res.body)).toEqual(['pseudo']);
            expect(JSON.stringify(res.body)).not.toMatch(/memberships|casino|Alpha|Beta/i);
        });
    });
});
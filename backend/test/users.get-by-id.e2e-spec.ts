import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // adjust
import { configureApp } from '../src/app.config'; // or inline the same setup as in your other e2e specs
import { PrismaService } from '../src/prisma/prisma.service'; // adjust

/*
 * ASSUMPTIONS TO CHECK:
 *  - USERS_ID_IS_PUBLIC: is GET /users/:id marked @Public()? Set it to match your decision.
 *    true  -> anonymous visitors get 200
 *    false -> anonymous visitors get 401 (logged-in users only)
 *  - ids are UUIDs (your JWT "sub" looked like one) and malformed ids are rejected with 400.
 *  - The public view contains only `pseudo`.
 *  - Requests below are sent by a logged-in user, so they work whether the route is public or not.
 *  - Run against a TEST database: beforeEach wipes the User table.
 */

const USERS_ID_IS_PUBLIC = true;

describe('GET /api/users/:id (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const PASSWORD = 'Correct-Horse-9-Battery!';
    const VIEWER = { pseudo: 'viewer', email: 'viewer@example.com' };
    const TARGET = {
        pseudo: 'targetplayer',
        email: 'target@example.com',
        firstName: 'Secret',
        lastName: 'Surname',
        phone: '+41791234567',
    };

    let targetId: string;
    let viewer: ReturnType<typeof request.agent>; // keeps the login cookie, like a browser

    const register = async (u: { pseudo: string; email: string; firstName?: string; lastName?: string; phone?: string }) => {
        const res = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send({
                firstName: 'First',
                lastName: 'Last',
                birthDate: '1990-01-01',
                password: PASSWORD,
                ...u,
            })
            .expect(201);
        return res.body as { id: string };
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({});

        await register(VIEWER);
        targetId = (await register(TARGET)).id;

        viewer = request.agent(app.getHttpServer());
        await viewer
            .post('/api/auth/login')
            .send({ email: VIEWER.email, password: PASSWORD })
            .expect(200);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('success', () => {
        it('returns 200 with the public view of another user', async () => {
            const res = await viewer.get(`/api/users/${targetId}`).expect(200);
            expect(res.body).toMatchObject({ pseudo: TARGET.pseudo });
        });

        it('returns exactly the public keys (only the pseudo)', async () => {
            const res = await viewer.get(`/api/users/${targetId}`).expect(200);
            expect(Object.keys(res.body).sort()).toEqual(['pseudo']);
        });

        it('leaks no private data of the target', async () => {
            const res = await viewer.get(`/api/users/${targetId}`).expect(200);
            const text = JSON.stringify(res.body);

            for (const secret of [
                TARGET.email, TARGET.firstName, TARGET.lastName, TARGET.phone,
                PASSWORD, '$argon2', 'passwordHash', 'deletedAt', targetId,
            ]) {
                expect(text).not.toContain(secret);
            }
            expect(res.body).not.toHaveProperty('role');
            expect(res.body).not.toHaveProperty('birthDate');
        });

        it('returns only the public view even for the caller\'s own id (the full view is /users/me)', async () => {
            const me = await prisma.user.findUniqueOrThrow({ where: { email: VIEWER.email } });
            const res = await viewer.get(`/api/users/${me.id}`).expect(200);

            expect(Object.keys(res.body).sort()).toEqual(['pseudo']);
        });
    });

    describe('errors', () => {
        it.each([
            ['not a uuid', 'abc'],
            ['a number', '123'],
            ['almost a uuid (invalid character)', '00000000-0000-0000-0000-00000000000g'],
            ['too short', '1234-5678'],
        ])('malformed id (%s) returns 400', async (_name, id) => {
            await viewer.get(`/api/users/${id}`).expect(400);
        });

        it('unknown but well-formed id returns 404', async () => {
            await viewer.get(`/api/users/${randomUUID()}`).expect(404);
        });

        it('error responses contain no user data', async () => {
            const res = await viewer.get(`/api/users/${randomUUID()}`).expect(404);
            const text = JSON.stringify(res.body);

            expect(text).not.toContain(TARGET.email);
            expect(text).not.toContain('$argon2');
        });
    });

    /*
     * DECISION FOR THE TEAM: should a deleted / anonymized account still be visible?
     * findById only throws 404 when the row does not exist, so unless the route filters on deletedAt,
     * this test FAILS and shows that a "deleted" user is still reachable. Fix the route (or findById)
     * if the answer is "no", or change the expectation if the team decides otherwise.
     */
    describe('deleted accounts', () => {
        it('does not expose a deleted / anonymized user (404)', async () => {
            await prisma.user.update({ where: { id: targetId }, data: { deletedAt: new Date() } });

            await viewer.get(`/api/users/${targetId}`).expect(404);
        });
    });

    describe('anonymous access (no cookie)', () => {
        it(`${USERS_ID_IS_PUBLIC ? 'is allowed (200, public view only)' : 'requires a login (401)'}`, async () => {
            const res = await request(app.getHttpServer()).get(`/api/users/${targetId}`);

            if (USERS_ID_IS_PUBLIC) {
                expect(res.status).toBe(200);
                expect(Object.keys(res.body).sort()).toEqual(['pseudo']);
            } else {
                expect(res.status).toBe(401);
                expect(res.body).not.toHaveProperty('pseudo');
            }
        });

        it('a garbage cookie behaves like no cookie on a protected route, and never crashes (no 500)', async () => {
            const res = await request(app.getHttpServer())
                .get(`/api/users/${targetId}`)
                .set('Cookie', 'access_token=garbage.token.value'); // adjust the name if COOKIE_NAME differs

            expect(res.status).not.toBe(500);
            expect([200, 401]).toContain(res.status);
        });
    });
});
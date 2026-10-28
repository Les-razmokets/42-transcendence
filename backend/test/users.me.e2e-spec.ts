import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // adjust
import { configureApp } from '../src/app.config'; // or inline the same setup as in your other e2e specs
import { PrismaService } from '../src/prisma/prisma.service'; // adjust
import { COOKIE_NAME } from '../src/auth/utils/cookie'; // adjust
import { Role } from '../src/generated/prisma/client'; // value import: Role.USER / Role.ADMIN

/*
 * ASSUMPTIONS TO CHECK:
 *  - GET /api/users/me exists, is NOT @Public(), is declared before /users/:id, and returns the
 *    "my profile" view.
 *  - Role.USER and Role.ADMIN exist in your Prisma enum.
 *  - JwtService can be retrieved with { strict: false } (provided by JwtModule inside AuthModule).
 *  - NODE_ENV is not "production" in tests (otherwise the cookie is Secure and the agent will not send it).
 *  - Run against a TEST database: beforeEach wipes the User table.
 */

describe('GET /api/users/me (e2e): the whole auth chain', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwt: JwtService;

    const PASSWORD = 'Correct-Horse-9-Battery!';
    const ME = { pseudo: 'meuser', email: 'me@example.com', firstName: 'Mia', lastName: 'Moi' };
    const OTHER = { pseudo: 'otheruser', email: 'other@example.com', firstName: 'Otto', lastName: 'Autre' };

    const MY_PROFILE_KEYS = [
        'birthDate', 'createdAt', 'email', 'firstName', 'id',
        'lastName', 'phone', 'pseudo', 'role', 'updatedAt',
    ];

    let meId: string;
    let otherId: string;

    const server = () => app.getHttpServer();
    const me = () => request(server()).get('/api/users/me');
    const meWithCookie = (value: string) => me().set('Cookie', `${COOKIE_NAME}=${value}`);
    const meWithToken = (token: string) => meWithCookie(token);

    const register = async (u: { pseudo: string; email: string; firstName: string; lastName: string }) => {
        const res = await request(server())
            .post('/api/auth/register')
            .send({ birthDate: '1990-01-01', password: PASSWORD, ...u })
            .expect(201);
        return res.body.id as string;
    };

    // a logged-in "browser": the agent stores the cookie and sends it back
    const loggedInAgent = async (email: string) => {
        const agent = request.agent(server());
        await agent.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
        return agent;
    };

    // reads the token from the Set-Cookie header of a real login
    const loginToken = async (email: string) => {
        const res = await request(server()).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
        const raw = res.headers['set-cookie'] as unknown as string[];
        const cookie = raw.find((c) => c.startsWith(`${COOKIE_NAME}=`))!;
        return cookie.split(';')[0].slice(COOKIE_NAME.length + 1);
    };

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();

        prisma = app.get(PrismaService);
        jwt = app.get(JwtService, { strict: false });
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({});
        meId = await register(ME);
        otherId = await register(OTHER);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('success', () => {
        it('returns 200 with the profile of the logged-in user (and not /users/:id with id "me")', async () => {
            const agent = await loggedInAgent(ME.email);
            const res = await agent.get('/api/users/me').expect(200); // a 400 here would mean /:id matched first

            expect(res.body).toMatchObject({ id: meId, pseudo: ME.pseudo, email: ME.email });
        });

        it('returns exactly the "my profile" keys and never leaks the hash', async () => {
            const agent = await loggedInAgent(ME.email);
            const res = await agent.get('/api/users/me').expect(200);

            expect(Object.keys(res.body).sort()).toEqual([...MY_PROFILE_KEYS].sort());
            expect(res.body).not.toHaveProperty('passwordHash');
            expect(res.body).not.toHaveProperty('deletedAt');
            expect(JSON.stringify(res.body)).not.toContain('$argon2');
            expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
        });

        it('returns the caller\'s own data, never another user\'s', async () => {
            const agentOther = await loggedInAgent(OTHER.email);
            const res = await agentOther.get('/api/users/me').expect(200);

            expect(res.body.id).toBe(otherId);
            expect(res.body.email).toBe(OTHER.email);
            expect(JSON.stringify(res.body)).not.toContain(ME.email);
        });

        it('is the same view as the login response', async () => {
            const loginRes = await request(server())
                .post('/api/auth/login')
                .send({ email: ME.email, password: PASSWORD })
                .expect(200);
            const raw = loginRes.headers['set-cookie'] as unknown as string[];
            const token = raw[0].split(';')[0].slice(COOKIE_NAME.length + 1);

            const meRes = await meWithToken(token).expect(200);
            expect(meRes.body).toEqual(loginRes.body);
        });
    });

    describe('no valid authentication -> 401', () => {
        it('no cookie (proves the global guard is active)', async () => {
            await me().expect(401);
        });

        it('empty cookie', async () => {
            await meWithCookie('').expect(401);
        });

        it('garbage token', async () => {
            await meWithToken('not.a.token').expect(401);
        });

        it('cookie-parser JSON cookie (j:...) is an object, not a string: 401, not 500', async () => {
            await meWithCookie(encodeURIComponent('j:{"a":1}')).expect(401);
        });

        it('token signed with another secret', async () => {
            const forged = await new JwtService({ secret: 'another-secret-entirely-0123456789abcdef' })
                .signAsync({ sub: meId, role: Role.ADMIN });
            await meWithToken(forged).expect(401);
        });

        it('expired token', async () => {
            const expired = await jwt.signAsync({ sub: meId, role: Role.USER }, { expiresIn: -10 });
            await meWithToken(expired).expect(401);
        });

        it('token with another algorithm (the algorithm is pinned)', async () => {
            const hs384 = await jwt.signAsync({ sub: meId, role: Role.USER }, { algorithm: 'HS384' });
            await meWithToken(hs384).expect(401);
        });

        it('payload edited without re-signing (role escalation)', async () => {
            const [h, b, s] = (await loginToken(ME.email)).split('.');
            const body = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
            const forgedBody = Buffer.from(JSON.stringify({ ...body, sub: otherId, role: Role.ADMIN })).toString('base64url');

            await meWithToken(`${h}.${forgedBody}.${s}`).expect(401);
        });

        it('unsigned token (alg: none)', async () => {
            const [, b] = (await loginToken(ME.email)).split('.');
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');

            await meWithToken(`${header}.${b}.`).expect(401);
        });

        it('all failures return the same body (no hint about the cause)', async () => {
            const expired = await jwt.signAsync({ sub: meId, role: Role.USER }, { expiresIn: -10 });
            const responses = await Promise.all([
                me(),
                meWithToken('not.a.token'),
                meWithToken(expired),
            ]);

            for (const r of responses) expect(r.status).toBe(401);
            for (const r of responses) expect(r.body).toEqual(responses[0].body);
        });
    });

    describe('valid token, but the account changed after login', () => {
        it('user anonymized/deleted after login (deletedAt set): 401', async () => {
            const agent = await loggedInAgent(ME.email);
            await agent.get('/api/users/me').expect(200);

            await prisma.user.update({ where: { id: meId }, data: { deletedAt: new Date() } });

            await agent.get('/api/users/me').expect(401);
        });

        it('user removed from the database after login: 401, not 404', async () => {
            const agent = await loggedInAgent(ME.email);
            await prisma.user.delete({ where: { id: meId } });

            await agent.get('/api/users/me').expect(401);
        });

        it('role changed after login: the NEW role is returned without logging in again', async () => {
            const agent = await loggedInAgent(ME.email); // token was signed while the role was USER
            const before = await agent.get('/api/users/me').expect(200);
            expect(before.body.role).toBe(Role.USER);

            await prisma.user.update({ where: { id: meId }, data: { role: Role.ADMIN } });

            const after = await agent.get('/api/users/me').expect(200);
            expect(after.body.role).toBe(Role.ADMIN);
        });

        it('a token that CLAIMS ADMIN does not make the user ADMIN (the DB decides)', async () => {
            const lying = await jwt.signAsync({ sub: meId, role: Role.ADMIN }); // properly signed, wrong claim
            const res = await meWithToken(lying).expect(200);

            expect(res.body.role).toBe(Role.USER);
        });
    });

    describe('cookie lifecycle', () => {
        it('login -> /me 200 -> logout -> /me 401', async () => {
            const agent = await loggedInAgent(ME.email);
            await agent.get('/api/users/me').expect(200);

            await agent.post('/api/auth/logout').expect(204);

            await agent.get('/api/users/me').expect(401); // the cookie jar dropped the cleared cookie
        });

        it('KNOWN LIMITATION: logout only clears the cookie, a copied token stays valid until it expires', async () => {
            // JWTs are stateless: there is no server-side session to revoke.
            // This test documents the behaviour; delete it if you add a revocation list.
            const token = await loginToken(ME.email);
            await request(server()).post('/api/auth/logout').set('Cookie', `${COOKIE_NAME}=${token}`).expect(204);

            await meWithToken(token).expect(200);
        });
    });
});
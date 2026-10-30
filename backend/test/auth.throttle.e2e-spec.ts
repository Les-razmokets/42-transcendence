import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // adjust
import { configureApp } from '../src/app.config'; // or inline the same setup as in your other e2e specs
import { PrismaService } from '../src/prisma/prisma.service'; // adjust

/*
 * Rate limiting e2e spec.
 *
 * ASSUMPTIONS TO CHECK (change the constants below to match your real configuration):
 *  - ThrottlerModule.forRoot has `skipIf: () => process.env.THROTTLE_DISABLED === 'true'`, and your
 *    e2e environment file sets THROTTLE_DISABLED=true so the other suites are not throttled.
 *    THIS spec turns throttling back on with THROTTLE_DISABLED=false.
 *  - LOGIN_LIMIT / REGISTER_LIMIT / DEFAULT_LIMIT match your @Throttle values and your global default.
 *  - HEALTH_PATH is the real path of the health route, marked @SkipThrottle().
 *  - ThrottlerGuard is registered before AuthGuard (this spec proves it).
 *
 * The in-memory throttler storage lives as long as the app, so a FRESH app is built for each test:
 * a bucket filled by one test can never leak into the next one.
 */

jest.setTimeout(30_000);

const LOGIN_LIMIT = 5;
const REGISTER_LIMIT = 3;
const DEFAULT_LIMIT = 100;
const HEALTH_PATH = '/api/health';

const PASSWORD = 'Correct-Horse-9-Battery!';
const ORIGINAL_FLAG = process.env.THROTTLE_DISABLED;

describe('Rate limiting (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const server = () => app.getHttpServer();

    const login = (email = 'nobody@example.com', password = 'Wrong-Password-1!') =>
        request(server()).post('/api/auth/login').send({ email, password });

    // an empty body fails validation (400) but is still counted: guards run before pipes
    const register = (body: Record<string, unknown> = {}) =>
        request(server()).post('/api/auth/register').send(body);

    // sends `count` requests one after the other and returns every status
    const statuses = async (count: number, send: (i: number) => request.Test) => {
        const result: number[] = [];
        for (let i = 0; i < count; i++) result.push((await send(i)).status);
        return result;
    };

    beforeEach(async () => {
        process.env.THROTTLE_DISABLED = 'false'; // read on every request by skipIf

        const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();

        prisma = app.get(PrismaService);
        await prisma.user.deleteMany();
    });

    afterEach(async () => {
        await app.close();
    });

    afterAll(() => {
        if (ORIGINAL_FLAG === undefined) delete process.env.THROTTLE_DISABLED;
        else process.env.THROTTLE_DISABLED = ORIGINAL_FLAG;
    });

    describe('POST /auth/login', () => {
        it(`answers 401 for ${LOGIN_LIMIT} wrong attempts, then 429`, async () => {
            const first = await statuses(LOGIN_LIMIT, () => login());
            expect(first).toEqual(Array(LOGIN_LIMIT).fill(401));

            const blocked = await login();
            expect(blocked.status).toBe(429);
        });

        it('sends a Retry-After header when blocking', async () => {
            await statuses(LOGIN_LIMIT, () => login());

            const blocked = await login().expect(429);

            expect(blocked.headers['retry-after']).toBeDefined();
            expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        });

        it('counts every attempt, not only the failed ones: the right password is blocked too', async () => {
            await register({
                firstName: 'Rate', lastName: 'Limit', pseudo: 'ratelimit', email: 'rate@example.com',
                password: PASSWORD, birthDate: '1990-01-01',
            }).expect(201);

            // register used its own bucket, login is still untouched
            const ok = await statuses(LOGIN_LIMIT, () => login('rate@example.com', PASSWORD));
            expect(ok).toEqual(Array(LOGIN_LIMIT).fill(200));

            await login('rate@example.com', PASSWORD).expect(429);
        });

        it('limits per client, not per email: changing the email does not reset the limit', async () => {
            await statuses(LOGIN_LIMIT, (i) => login(`user${i}@example.com`));

            await login('yet.another@example.com').expect(429);
        });

        it('does not let a spoofed X-Forwarded-For header escape the limit', async () => {
            // If this fails, "trust proxy" is enabled and the client IP can be forged.
            // That is only acceptable behind a real reverse proxy that overwrites the header.
            await statuses(LOGIN_LIMIT, (i) => login().set('X-Forwarded-For', `10.0.0.${i + 1}`));

            await login().set('X-Forwarded-For', '203.0.113.99').expect(429);
        });

        it('the 429 body reveals nothing about accounts', async () => {
            await statuses(LOGIN_LIMIT, () => login('known@example.com'));

            const blocked = await login('known@example.com').expect(429);
            const text = JSON.stringify(blocked.body);

            expect(text).not.toContain('known@example.com');
            expect(text).not.toContain('argon2');
        });
    });

    describe('POST /auth/register', () => {
        it(`answers 400 for ${REGISTER_LIMIT} invalid attempts, then 429`, async () => {
            const first = await statuses(REGISTER_LIMIT, () => register());
            expect(first).toEqual(Array(REGISTER_LIMIT).fill(400));

            await register().expect(429);
        });

        it('a blocked request creates no user', async () => {
            await statuses(REGISTER_LIMIT, () => register());

            await register({
                firstName: 'Late', lastName: 'Comer', pseudo: 'latecomer', email: 'late@example.com',
                password: PASSWORD, birthDate: '1990-01-01',
            }).expect(429);

            expect(await prisma.user.count()).toBe(0);
        });
    });

    describe('separate buckets', () => {
        it('a throttled login does not throttle other routes', async () => {
            await statuses(LOGIN_LIMIT, () => login());
            await login().expect(429);

            await request(server()).get('/api/users/me').expect(401); // not 429
            await register().expect(400);                              // not 429
        });
    });

    describe('default limit and guard order', () => {
        it(`a protected route answers 401 up to the default limit (${DEFAULT_LIMIT}), then 429`, async () => {
            // If AuthGuard ran BEFORE ThrottlerGuard, the 401 would stop every request
            // and the throttler would never see them: this test would never get a 429.
            const first = await statuses(DEFAULT_LIMIT, () => request(server()).get('/api/users/me'));
            expect(first.every((s) => s === 401)).toBe(true);

            await request(server()).get('/api/users/me').expect(429);
        });

        it('anonymous requests to a role-protected or public route are counted the same way', async () => {
            const first = await statuses(DEFAULT_LIMIT, () => request(server()).get('/api/users/not-a-uuid'));
            expect(first).not.toContain(429);

            await request(server()).get('/api/users/not-a-uuid').expect(429);
        });
    });

    describe('exclusions', () => {
        it('the health route is never throttled (@SkipThrottle)', async () => {
            const all = await statuses(DEFAULT_LIMIT + 10, () => request(server()).get(HEALTH_PATH));

            expect(all).not.toContain(429);
        });
    });

    describe('THROTTLE_DISABLED switch', () => {
        it('turns the limit off (used by the other e2e suites)', async () => {
            process.env.THROTTLE_DISABLED = 'true';

            const all = await statuses(LOGIN_LIMIT + 5, () => login());

            expect(all).toEqual(Array(LOGIN_LIMIT + 5).fill(401));
        });
    });
});
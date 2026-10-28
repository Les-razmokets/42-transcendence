import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module'; // adjust
import { PrismaService } from '../src/prisma/prisma.service'; // adjust
import { StandardSchemaSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { missingResponseSchema } from '../src/common/missing-response.schema';

/*
 * ASSUMPTIONS TO CHECK (I can't see your main.ts / prisma setup):
 *  1. The app setup below must mirror main.ts. Best practice: extract it into one
 *     function (e.g. configureApp(app)) used by both main.ts and this test.
 *  2. PrismaService exposes `user` (the Prisma model delegate).
 *  3. Run against a TEST database: beforeEach wipes the User table.
 */
 
describe('POST /api/auth/register (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let counter = 0;
 
    const PASSWORD = 'Correct-Horse-9-Battery!';
 
    // unique email + pseudo per call so tests never collide
    const validBody = (overrides: Record<string, unknown> = {}) => {
        counter++;
        return {
            firstName: 'Ada',
            lastName: 'Lovelace',
            pseudo: `user${counter}`,
            email: `user${counter}@example.com`,
            password: PASSWORD,
            birthDate: '1990-01-01',
            ...overrides,
        };
    };
 
    const register = (body: Record<string, unknown>) =>
        request(app.getHttpServer()).post('/api/auth/register').send(body);
 
    beforeAll(async () => {
    	const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    	app = moduleRef.createNestApplication();

   	 app.setGlobalPrefix('api');
   	 app.useGlobalPipes(
    	    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    	);
    	app.useGlobalInterceptors(
		new StandardSchemaSerializerInterceptor(app.get(Reflector), {
            		schema: missingResponseSchema,
        	}),
    	);

    	await app.init();
    	prisma = app.get(PrismaService);
	});
 
    beforeEach(async () => {
        await prisma.user.deleteMany({});
    });
 
    afterAll(async () => {
        await app.close();
    });
 
    describe('success', () => {
        it('returns 201 with the "my profile" view', async () => {
            const body = validBody();
            const res = await register(body).expect(201);
 
            expect(res.body).toMatchObject({ pseudo: body.pseudo, email: body.email });
        });
 
        it('never leaks password or passwordHash in the response', async () => {
            const res = await register(validBody()).expect(201);
 
            expect(res.body).not.toHaveProperty('password');
            expect(res.body).not.toHaveProperty('passwordHash');
            expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
            expect(JSON.stringify(res.body)).not.toContain('$argon2');
        });
 
        it('stores an argon2id hash, not the plaintext', async () => {
            const body = validBody();
            await register(body).expect(201);
 
            const stored = await prisma.user.findFirstOrThrow({ where: { email: body.email } });
            expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
            expect(stored.passwordHash).not.toContain(PASSWORD);
        });
 
        it('normalizes email and pseudo (trim + lowercase)', async () => {
            const res = await register(
                validBody({ email: '  MixedCase@Example.COM ', pseudo: '  MixedPseudo ' }),
            ).expect(201);
 
            expect(res.body.email).toBe('mixedcase@example.com');
            expect(res.body.pseudo).toBe('mixedpseudo');
        });
    });
 
    describe('privilege escalation', () => {
        it('rejects a body that tries to set the role (400)', async () => {
            await register(validBody({ role: 'ADMIN' })).expect(400);
            expect(await prisma.user.count()).toBe(0);
        });
 
        it('rejects other unknown fields (400)', async () => {
            await register(validBody({ passwordHash: 'x', deletedAt: null })).expect(400);
        });
    });
 
    describe('uniqueness (409)', () => {
        it('rejects a duplicate email and names the field', async () => {
            const first = validBody();
            await register(first).expect(201);
 
            const res = await register(validBody({ email: first.email })).expect(409);
            expect(JSON.stringify(res.body)).toMatch(/email/i);
        });
 
        it('rejects a duplicate email with a different case', async () => {
            const first = validBody({ email: 'case@example.com' });
            await register(first).expect(201);
 
            await register(validBody({ email: 'CASE@Example.com' })).expect(409);
        });
 
        it('rejects a duplicate pseudo and names the field', async () => {
            const first = validBody();
            await register(first).expect(201);
 
            const res = await register(validBody({ pseudo: first.pseudo })).expect(409);
            expect(JSON.stringify(res.body)).toMatch(/pseudo/i);
        });
 
        it('lets the DB arbitrate parallel registrations: exactly one 201, one 409, no 500', async () => {
            const email = 'race@example.com';
 
            const results = await Promise.all([
                register(validBody({ email })),
                register(validBody({ email })),
            ]);
 
            const statuses = results.map((r) => r.status).sort();
            expect(statuses).toEqual([201, 409]);
            expect(await prisma.user.count({ where: { email } })).toBe(1);
        });
    });
 
    describe('validation (400)', () => {
        const cases: [string, () => Record<string, unknown>][] = [
            ['missing firstName', () => { const b = validBody(); delete (b as any).firstName; return b; }],
            ['missing email', () => { const b = validBody(); delete (b as any).email; return b; }],
            ['missing password', () => { const b = validBody(); delete (b as any).password; return b; }],
            ['invalid email', () => validBody({ email: 'not-an-email' })],
            ['weak password', () => validBody({ password: 'password' })],
            ['password over 128 chars', () => validBody({ password: 'Aa1!'.repeat(33) })],
            ['pseudo with forbidden characters', () => validBody({ pseudo: 'bad pseudo!' })],
            ['pseudo over 20 chars', () => validBody({ pseudo: 'a'.repeat(21) })],
            ['under 18', () => {
                const d = new Date();
                d.setFullYear(d.getFullYear() - 10);
                return validBody({ birthDate: d.toISOString().slice(0, 10) });
            }],
            ['bad birthDate format', () => validBody({ birthDate: '01/01/1990' })],
            ['garbage birthDate', () => validBody({ birthDate: 'banana' })],
            ['empty body', () => ({})],
        ];
 
        it.each(cases)('%s', async (_name, build) => {
            await register(build()).expect(400);
            expect(await prisma.user.count()).toBe(0);
        });
    });
});
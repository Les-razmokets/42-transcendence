import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { Controller, Get, INestApplication, SerializeOptions } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { Roles } from '../src/auth/utils/roles.decorator';
import { Public } from '../src/auth/utils/public.decorator';
import { COOKIE_NAME } from '../src/auth/utils/cookie';
import { Role } from '../src/generated/prisma/client'; // value import: Role.USER / Role.ADMIN

/*
 * RolesGuard end to end, with a THROWAWAY controller that only exists in this spec:
 * it is added to the testing module below and never reaches the real application.
 */

const okSchema = z.object({ ok: z.boolean() });

@Controller('__test')
class TestRolesController {
    @Get('admin')
    @Roles(Role.ADMIN)
    @SerializeOptions({ schema: okSchema })
    adminOnly() {
        return { ok: true };
    }

    @Get('multi')
    @Roles(Role.USER, Role.ADMIN)
    @SerializeOptions({ schema: okSchema })
    multi() {
        return { ok: true };
    }

    @Get('open') // no @Roles(): any logged-in user
    @SerializeOptions({ schema: okSchema })
    open() {
        return { ok: true };
    }

    @Public()
    @Get('public')
    @Roles(Role.ADMIN) // @Public() must win
    @SerializeOptions({ schema: okSchema })
    publicWithRoles() {
        return { ok: true };
    }
}

describe('Roles (e2e): RolesGuard behind the real guards', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwt: JwtService;

    const PASSWORD = 'Correct-Horse-9-Battery!';
    const USER = { pseudo: 'plainuser', email: 'plain@example.com' };
    const ADMIN = { pseudo: 'adminuser', email: 'admin@example.com' };

    let userId: string;
    let adminId: string;
    let userAgent: ReturnType<typeof request.agent>;
    let adminAgent: ReturnType<typeof request.agent>;

    const server = () => app.getHttpServer();

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

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
            controllers: [TestRolesController], // throwaway routes, this spec only
        }).compile();

        app = moduleRef.createNestApplication();
        configureApp(app);
        await app.init();

        prisma = app.get(PrismaService);
        jwt = app.get(JwtService, { strict: false });
    });

    beforeEach(async () => {
        await prisma.user.deleteMany();

        userId = await register(USER);
        adminId = await register(ADMIN);
        await prisma.user.update({ where: { id: adminId }, data: { role: Role.ADMIN } });

        userAgent = await loggedInAgent(USER.email);
        adminAgent = await loggedInAgent(ADMIN.email);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('guard order: authentication first, then roles', () => {
        it('no cookie on an admin route is 401, NOT 403 (RolesGuard must run after AuthGuard)', async () => {
            await request(server()).get('/api/__test/admin').expect(401);
        });

        it('no cookie on a route without @Roles() is 401 too (the global AuthGuard still applies)', async () => {
            await request(server()).get('/api/__test/open').expect(401);
        });

        it('a garbage cookie on an admin route is 401', async () => {
            await request(server())
                .get('/api/__test/admin')
                .set('Cookie', `${COOKIE_NAME}=not.a.token`)
                .expect(401);
        });
    });

    describe('@Roles(Role.ADMIN)', () => {
        it('lets an admin through', async () => {
            const res = await adminAgent.get('/api/__test/admin').expect(200);
            expect(res.body).toEqual({ ok: true });
        });

        it('refuses a plain user with 403', async () => {
            await userAgent.get('/api/__test/admin').expect(403);
        });

        it('the 403 body reveals nothing (no role name, no hint about what is required)', async () => {
            const res = await userAgent.get('/api/__test/admin').expect(403);
            const text = JSON.stringify(res.body);

            expect(text).not.toMatch(/admin/i);
            expect(text).not.toMatch(/role/i);
            expect(text).not.toContain('argon2');
        });
    });

    describe('other combinations', () => {
        it.each([
            ['plain user', () => userAgent],
            ['admin', () => adminAgent],
        ])('@Roles(USER, ADMIN): %s passes', async (_name, agent) => {
            await agent().get('/api/__test/multi').expect(200);
        });

        it.each([
            ['plain user', () => userAgent],
            ['admin', () => adminAgent],
        ])('route without @Roles(): %s passes', async (_name, agent) => {
            await agent().get('/api/__test/open').expect(200);
        });

        it('@Public() wins over @Roles(): reachable with no cookie at all', async () => {
            const res = await request(server()).get('/api/__test/public').expect(200);
            expect(res.body).toEqual({ ok: true });
        });
    });

    describe('the role comes from the database, never from the token', () => {
        it('promoted after login: 403 becomes 200 with the SAME cookie, no new login', async () => {
            await userAgent.get('/api/__test/admin').expect(403);

            await prisma.user.update({ where: { id: userId }, data: { role: Role.ADMIN } });

            await userAgent.get('/api/__test/admin').expect(200);
        });

        it('demoted after login: 200 becomes 403 with the SAME cookie', async () => {
            await adminAgent.get('/api/__test/admin').expect(200);

            await prisma.user.update({ where: { id: adminId }, data: { role: Role.USER } });

            await adminAgent.get('/api/__test/admin').expect(403);
        });

        it('a properly signed token that CLAIMS admin does not make a plain user admin', async () => {
            const lying = await jwt.signAsync({ sub: userId, role: Role.ADMIN });

            await request(server())
                .get('/api/__test/admin')
                .set('Cookie', `${COOKIE_NAME}=${lying}`)
                .expect(403);
        });

        it('an admin deleted after login is 401, not 403 and not 200', async () => {
            await adminAgent.get('/api/__test/admin').expect(200);

            await prisma.user.update({ where: { id: adminId }, data: { deletedAt: new Date() } });

            await adminAgent.get('/api/__test/admin').expect(401);
        });

        it('an admin removed from the database is 401', async () => {
            await prisma.user.delete({ where: { id: adminId } });

            await adminAgent.get('/api/__test/admin').expect(401);
        });
    });

    describe('the throwaway routes are not part of the real app', () => {
        it('a normal app built WITHOUT the test controller has no /api/__test routes', async () => {
            const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
            const plain = moduleRef.createNestApplication();
            configureApp(plain);
            await plain.init();

            try {
                // 401 (guard) or 404 (no route) are both fine: it must never answer 200
                const res = await request(plain.getHttpServer()).get('/api/__test/public');
                expect(res.status).not.toBe(200);
            } finally {
                await plain.close();
            }
        });
    });
});
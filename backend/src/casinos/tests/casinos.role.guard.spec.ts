import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
    ExecutionContext,
    ForbiddenException,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { CasinoRoleGuard } from '../casinos-roles.guard';
import { CasinosAccessService } from '../casinos-access.service';
import { RequireCasinoRole } from '../utils/casinos-role.decorator';
import { CASINO_ROLE_KEY } from '../utils/casinos-role.constants';
import { Public } from '../../auth/utils/public.decorator';
import type { AuthenticatedRequest } from '../../auth/utils/auth-request';
import { CasinoRole, Role } from '../../generated/prisma/client'; // value imports

/*
 * Real Reflector + real @RequireCasinoRole() / @Public() on fake controllers, stubbed access service.
 * The service is tested on its own (casinos-access.service.spec.ts): here we test the GUARD around it.

 */

// ------------------------------------------------------------ fake controllers
class FloorController {
    @RequireCasinoRole(CasinoRole.FLOOR)
    floor() {}

    @RequireCasinoRole(CasinoRole.OWNER)
    owner() {}
}

@RequireCasinoRole(CasinoRole.OWNER)
class OwnerClassController {
    inherited() {}

    @RequireCasinoRole(CasinoRole.FLOOR)
    overridden() {}
}

class PublicWithCasinoController {
    @Public()
    @RequireCasinoRole(CasinoRole.FLOOR)
    both() {}
}

class UndecoratedController {
    anything() {}
}

// ------------------------------------------------------------ helpers
type Ctor = new () => object;
type ReqUser = NonNullable<AuthenticatedRequest['user']>;

const someUser = (): ReqUser => ({ id: 'u1', role: Role.USER }) as unknown as ReqUser;

const contextFor = (cls: Ctor, method: string, user: ReqUser | undefined, params: Record<string, unknown>) => {
    const req = { user, params } as unknown as AuthenticatedRequest;
    const handler = (cls.prototype as Record<string, (...args: unknown[]) => unknown>)[method];

    return {
        req,
        ctx: {
            switchToHttp: () => ({ getRequest: () => req }),
            getHandler: () => handler,
            getClass: () => cls,
        } as unknown as ExecutionContext,
    };
};

describe('@RequireCasinoRole() decorator', () => {
    it('stores the role ITSELF under the key (not an array), on a method', () => {
        const stored = new Reflector().get(CASINO_ROLE_KEY, FloorController.prototype.floor);
        expect(stored).toBe(CasinoRole.FLOOR);
    });

    it('stores the role on a class when used as a class decorator', () => {
        expect(new Reflector().get(CASINO_ROLE_KEY, OwnerClassController)).toBe(CasinoRole.OWNER);
    });

    it('attaches CasinoRoleGuard (nobody can set the metadata and forget the guard)', () => {
        const guards = Reflect.getMetadata(GUARDS_METADATA, FloorController.prototype.floor) as unknown[];
        expect(guards).toContain(CasinoRoleGuard);
    });

    it.each([
        ['undefined', undefined],
        ['an unknown string', 'BANANA'],
        ['an array', [CasinoRole.OWNER]],
        ['an empty string', ''],
    ])('throws at declaration time for %s (the app must refuse to start)', (_name, bad) => {
        expect(() => RequireCasinoRole(bad as never)).toThrow();
    });
});

describe('CasinoRoleGuard', () => {
    let assertAccess: jest.Mock<CasinosAccessService['assertAccess']>;
    let guard: CasinoRoleGuard;

    const run = async (ctx: ExecutionContext) => guard.canActivate(ctx);
    const capture = async (promise: Promise<unknown>) => promise.then(() => undefined, (e: unknown) => e);

    beforeEach(() => {
        assertAccess = jest.fn<CasinosAccessService['assertAccess']>();
        assertAccess.mockResolvedValue(undefined);

        guard = new CasinoRoleGuard(new Reflector(), { assertAccess } as unknown as CasinosAccessService);
    });

    describe('delegates the decision to the access service', () => {
        it('calls it with the user, the casinoId of the ROUTE and the minimum of that route, and returns true', async () => {
            const user = someUser();
            const { ctx } = contextFor(FloorController, 'floor', user, { casinoId: 'casino-1' });

            await expect(run(ctx)).resolves.toBe(true);

            expect(assertAccess).toHaveBeenCalledTimes(1);
            expect(assertAccess).toHaveBeenCalledWith(user, 'casino-1', CasinoRole.FLOOR);
        });

        it('uses the minimum declared on THAT route (OWNER route -> OWNER)', async () => {
            const user = someUser();
            const { ctx } = contextFor(FloorController, 'owner', user, { casinoId: 'casino-1' });

            await run(ctx);

            expect(assertAccess).toHaveBeenCalledWith(user, 'casino-1', CasinoRole.OWNER);
        });

        it('WAITS for the service: a refusal that arrives later still blocks the request', async () => {
            // if the guard forgets to "await", it returns true before the rejection happens
            const refusal = new NotFoundException();
            assertAccess.mockImplementation(
                () => new Promise<void>((_, reject) => setTimeout(() => reject(refusal), 10)),
            );
            const { ctx } = contextFor(FloorController, 'floor', someUser(), { casinoId: 'casino-1' });

            await expect(run(ctx)).rejects.toBe(refusal);
        });

        it('lets a 404 through unchanged (the same exception object, not rewrapped)', async () => {
            const notFound = new NotFoundException();
            assertAccess.mockRejectedValue(notFound);
            const { ctx } = contextFor(FloorController, 'floor', someUser(), { casinoId: 'casino-1' });

            await expect(run(ctx)).rejects.toBe(notFound);
        });

        it('lets a 403 through unchanged (the 404 / 403 distinction is kept)', async () => {
            const forbidden = new ForbiddenException();
            assertAccess.mockRejectedValue(forbidden);
            const { ctx } = contextFor(FloorController, 'owner', someUser(), { casinoId: 'casino-1' });

            await expect(run(ctx)).rejects.toBe(forbidden);
        });

        it('lets a real failure through (a database error is not turned into an access decision)', async () => {
            const boom = new Error('db down');
            assertAccess.mockRejectedValue(boom);
            const { ctx } = contextFor(FloorController, 'floor', someUser(), { casinoId: 'casino-1' });

            await expect(run(ctx)).rejects.toBe(boom);
        });
    });

    describe('class-level versus method-level', () => {
        it('a class-level minimum applies to its methods', async () => {
            const user = someUser();
            const { ctx } = contextFor(OwnerClassController, 'inherited', user, { casinoId: 'c1' });

            await run(ctx);

            expect(assertAccess).toHaveBeenCalledWith(user, 'c1', CasinoRole.OWNER);
        });

        it('a method-level minimum overrides the class-level one', async () => {
            const user = someUser();
            const { ctx } = contextFor(OwnerClassController, 'overridden', user, { casinoId: 'c1' });

            await run(ctx);

            expect(assertAccess).toHaveBeenCalledWith(user, 'c1', CasinoRole.FLOOR);
        });
    });

    describe('fails closed: it never says yes when something is wrong', () => {
        it('no decorator metadata on the route (guard attached by hand): 500, service not called', async () => {
            const { ctx } = contextFor(UndecoratedController, 'anything', someUser(), { casinoId: 'c1' });

            await expect(run(ctx)).rejects.toBeInstanceOf(InternalServerErrorException);
            expect(assertAccess).not.toHaveBeenCalled();
        });

        it('no user on the request: 401, service not called', async () => {
            const { ctx } = contextFor(FloorController, 'floor', undefined, { casinoId: 'c1' });

            await expect(run(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
            expect(assertAccess).not.toHaveBeenCalled();
        });

        it.each([
            ['no params at all', {}],
            ['an empty casinoId', { casinoId: '' }],
            ['a casinoId that is an array', { casinoId: ['a', 'b'] }],
            ['a casinoId that is a number', { casinoId: 42 }],
            ['a casinoId that is null', { casinoId: null }],
        ])('%s: 500 (a route declared without :casinoId is a wiring mistake), service not called', async (_name, params) => {
            const { ctx } = contextFor(FloorController, 'floor', someUser(), params);

            const error = await capture(run(ctx));

            expect(error).toBeInstanceOf(InternalServerErrorException);
            expect(error).not.toBeInstanceOf(UnauthorizedException); // not a login problem
            expect(assertAccess).not.toHaveBeenCalled();
        });

        it('@Public() + @RequireCasinoRole(): with no user it is 401, the combination cannot open a route', async () => {
            const { ctx } = contextFor(PublicWithCasinoController, 'both', undefined, { casinoId: 'c1' });

            await expect(run(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
            expect(assertAccess).not.toHaveBeenCalled();
        });
    });

    describe('the client is never told about internals', () => {
        it('the 500 for a missing decorator is bare (no message about decorators or guards)', async () => {
            const { ctx } = contextFor(UndecoratedController, 'anything', someUser(), { casinoId: 'c1' });

            const error = await capture(run(ctx));
            const text = JSON.stringify((error as InternalServerErrorException).getResponse());

            expect(text).not.toMatch(/decorator|guard/i);
        });

        it('the 500 for a missing casinoId is bare (no message about routes or params)', async () => {
            const { ctx } = contextFor(FloorController, 'floor', someUser(), {});

            const error = await capture(run(ctx));
            const text = JSON.stringify((error as InternalServerErrorException).getResponse());

            expect(text).not.toMatch(/casinoId|route|param/i);
        });
    });
});
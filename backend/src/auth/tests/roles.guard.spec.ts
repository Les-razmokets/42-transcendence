import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard'; //
import { Roles, ROLES_KEY } from '../utils/roles.decorator';
import { Public } from '../utils/public.decorator';
import type { AuthenticatedRequest } from '../utils/auth-request';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER / Role.ADMIN

/*
 * Real Reflector + real @Roles() / @Public() decorators on fake controllers, so the metadata
 * key between the decorator and the guard is really tested (a wrong key would make the guard
 * silently let everybody through: the "no @Roles()" case).
 */

// ---------------------------------------------------------------- fake controllers
class NoRolesController {
  anything() {}
}

class AdminOnlyController {
  @Roles(Role.ADMIN)
  admin() {}

  @Roles(Role.USER, Role.ADMIN)
  several() {}
}

@Roles(Role.ADMIN)
class ClassLevelAdminController {
  inherited() {}

  @Roles(Role.USER, Role.ADMIN)
  overridden() {} // the method-level @Roles() must win over the class-level one
}

class PublicAndRolesController {
  @Public()
  @Roles(Role.ADMIN)
  both() {}
}

@Public()
@Roles(Role.ADMIN)
class PublicClassController {
  both() {}
}

// ---------------------------------------------------------------- helpers
type Ctor = new () => object;

const asUser = (role: unknown) =>
  ({ id: 'u1', role }) as unknown as NonNullable<AuthenticatedRequest['user']>;

const contextFor = (
  cls: Ctor,
  method: string,
  user?: AuthenticatedRequest['user'],
) => {
  const req = { user } as unknown as AuthenticatedRequest;
  const handler = (
    cls.prototype as Record<string, (...args: unknown[]) => unknown>
  )[method];

  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => cls,
    } as unknown as ExecutionContext,
  };
};

describe('@Roles() decorator', () => {
  it('stores the list of roles under ROLES_KEY on the method', () => {
    const stored = new Reflector().get<Role[]>(
      ROLES_KEY,
      AdminOnlyController.prototype.several,
    );
    expect(stored).toEqual([Role.USER, Role.ADMIN]);
  });

  it('stores the list on the class when used as a class decorator', () => {
    const stored = new Reflector().get<Role[]>(
      ROLES_KEY,
      ClassLevelAdminController,
    );
    expect(stored).toEqual([Role.ADMIN]);
  });

  it('stores nothing on a route without @Roles()', () => {
    expect(
      new Reflector().get(ROLES_KEY, NoRolesController.prototype.anything),
    ).toBeUndefined();
  });

  it('rejects an empty list at declaration time (a mistake must not silently lock or open a route)', () => {
    expect(() => Roles()).toThrow();
  });
});

describe('RolesGuard', () => {
  let guard: RolesGuard;

  // async wrapper: turns a synchronous throw into a rejection, and handles sync or async guards alike
  const run = async (ctx: ExecutionContext) => guard.canActivate(ctx);

  beforeEach(() => {
    guard = new RolesGuard(new Reflector());
  });

  describe('route without @Roles()', () => {
    it('lets a USER through', async () => {
      const { ctx } = contextFor(
        NoRolesController,
        'anything',
        asUser(Role.USER),
      );
      await expect(run(ctx)).resolves.toBe(true);
    });

    it('lets an ADMIN through', async () => {
      const { ctx } = contextFor(
        NoRolesController,
        'anything',
        asUser(Role.ADMIN),
      );
      await expect(run(ctx)).resolves.toBe(true);
    });

    it('does not check the login itself (that is AuthGuard job)', async () => {
      const { ctx } = contextFor(NoRolesController, 'anything', undefined);
      await expect(run(ctx)).resolves.toBe(true);
    });
  });

  describe('@Roles(Role.ADMIN)', () => {
    it('lets an ADMIN through', async () => {
      const { ctx } = contextFor(
        AdminOnlyController,
        'admin',
        asUser(Role.ADMIN),
      );
      await expect(run(ctx)).resolves.toBe(true);
    });

    it('refuses a USER with 403', async () => {
      const { ctx } = contextFor(
        AdminOnlyController,
        'admin',
        asUser(Role.USER),
      );
      await expect(run(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails closed with 401 when there is no user (guard order broken): never true, never 403', async () => {
      const { ctx } = contextFor(AdminOnlyController, 'admin', undefined);

      const promise = run(ctx);

      await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(promise).rejects.not.toBeInstanceOf(ForbiddenException);
    });

    it('refuses a user whose role is unknown or missing (403, not a crash)', async () => {
      for (const role of [undefined, null, '', 'SUPERUSER']) {
        const { ctx } = contextFor(AdminOnlyController, 'admin', asUser(role));
        await expect(run(ctx)).rejects.toBeInstanceOf(ForbiddenException);
      }
    });
  });

  describe('several roles', () => {
    it.each([Role.USER, Role.ADMIN])(
      'lets %s through when it is in the list',
      async (role) => {
        const { ctx } = contextFor(
          AdminOnlyController,
          'several',
          asUser(role),
        );
        await expect(run(ctx)).resolves.toBe(true);
      },
    );
  });

  describe('class-level versus method-level', () => {
    it('a class-level @Roles() applies to its methods', async () => {
      const ok = contextFor(
        ClassLevelAdminController,
        'inherited',
        asUser(Role.ADMIN),
      );
      const refused = contextFor(
        ClassLevelAdminController,
        'inherited',
        asUser(Role.USER),
      );

      await expect(run(ok.ctx)).resolves.toBe(true);
      await expect(run(refused.ctx)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a method-level @Roles() overrides the class-level one', async () => {
      const { ctx } = contextFor(
        ClassLevelAdminController,
        'overridden',
        asUser(Role.USER),
      );
      await expect(run(ctx)).resolves.toBe(true);
    });
  });

  describe('@Public() wins over @Roles()', () => {
    it('on a method: passes with no user at all', async () => {
      const { ctx } = contextFor(PublicAndRolesController, 'both', undefined);
      await expect(run(ctx)).resolves.toBe(true);
    });

    it('on a method: passes for a USER too', async () => {
      const { ctx } = contextFor(
        PublicAndRolesController,
        'both',
        asUser(Role.USER),
      );
      await expect(run(ctx)).resolves.toBe(true);
    });

    it('on a class: passes with no user', async () => {
      const { ctx } = contextFor(PublicClassController, 'both', undefined);
      await expect(run(ctx)).resolves.toBe(true);
    });
  });

  describe('error responses reveal nothing', () => {
    it('the 403 is a bare ForbiddenException (does not say which role is required)', async () => {
      const { ctx } = contextFor(
        AdminOnlyController,
        'admin',
        asUser(Role.USER),
      );

      const error = await run(ctx).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual(
        new ForbiddenException().getResponse(),
      );
    });

    it('the 401 is a bare UnauthorizedException', async () => {
      const { ctx } = contextFor(AdminOnlyController, 'admin', undefined);

      const error = await run(ctx).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual(
        new UnauthorizedException().getResponse(),
      );
    });
  });

  it('does not modify the request', async () => {
    const user = asUser(Role.ADMIN);
    const { ctx, req } = contextFor(AdminOnlyController, 'admin', user);

    await run(ctx);

    expect(req.user).toBe(user);
    expect(user).toEqual({ id: 'u1', role: Role.ADMIN });
  });
});

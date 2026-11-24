import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../auth.guard';
import { SessionService } from '../session.service';
import { Public } from '../utils/public.decorator';
import { COOKIE_NAME } from '../utils/cookie';
import type { AuthenticatedRequest } from '../utils/auth-request';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.USER

/*
 * Real Reflector, real @Public() decorator, mocked SessionService.
 * The guard only does the HTTP part: @Public() check, read the cookie,
 * delegate the token to SessionService, attach the user to the request.
 * Token and user validation is covered in session.service.spec.ts.
 */

// --- fake controllers, so the Reflector reads REAL metadata ---
class FakeController {
  @Public()
  open() {}

  closed() {}
}

@Public()
class FakePublicController {
  anything() {}
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let session: { verify: jest.Mock<SessionService['verify']> };

  const SESSION = {
    id: 'u1',
    role: Role.USER,
    exp: Math.floor(Date.now() / 1000) + 60,
  };

  // fake request with an optional cookie value (anything: string, object, undefined...)
  const makeReq = (cookie?: unknown): AuthenticatedRequest =>
    ({
      cookies: cookie === undefined ? {} : { [COOKIE_NAME]: cookie },
    }) as unknown as AuthenticatedRequest;

  const makeContext = (
    req: AuthenticatedRequest,
    handler: (...args: any[]) => any = FakeController.prototype.closed,
    cls: new () => unknown = FakeController,
    type: 'http' | 'ws' = 'http',
  ) =>
    ({
      getType: () => type,
      // outside HTTP there is no request: reading it would be the bug from issue 1
      switchToHttp: () => {
        if (type !== 'http')
          throw new Error('switchToHttp() called on a non-HTTP context');
        return { getRequest: () => req };
      },
      getHandler: () => handler,
      getClass: () => cls,
    }) as unknown as ExecutionContext;

  const run = (cookie?: unknown) => {
    const req = makeReq(cookie);
    return { req, promise: guard.canActivate(makeContext(req)) };
  };

  beforeEach(() => {
    session = { verify: jest.fn<SessionService['verify']>() };
    session.verify.mockResolvedValue(SESSION);

    guard = new AuthGuard(
      session as unknown as SessionService,
      new Reflector(),
    );
  });

  describe('public routes', () => {
    it('lets a @Public() method through without a cookie, and never verifies anything', async () => {
      const req = makeReq();
      const ctx = makeContext(req, FakeController.prototype.open);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(session.verify).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('lets a route of a @Public() controller through', async () => {
      const ctx = makeContext(
        makeReq(),
        FakePublicController.prototype.anything,
        FakePublicController,
      );

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(session.verify).not.toHaveBeenCalled();
    });

    it('protects a route that is not marked public', async () => {
      await expect(run().promise).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('WebSocket context: authentication is done at the handshake, not here', () => {
    it('lets a WS message through on a non-public handler, without reading any request or verifying anything', async () => {
      const ctx = makeContext(
        makeReq(),
        FakeController.prototype.closed,
        FakeController,
        'ws',
      );

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(session.verify).not.toHaveBeenCalled();
    });
  });

  describe('missing or malformed cookie -> 401, SessionService is never called', () => {
    it.each([
      ['no cookie at all', undefined],
      ['empty string', ''],
      [
        'an object (cookie-parser turns "j:..." cookies into objects)',
        { a: 1 },
      ],
      ['an array', ['x']],
      ['a number', 42],
    ])('%s', async (_name, cookie) => {
      await expect(run(cookie).promise).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(session.verify).not.toHaveBeenCalled();
    });

    it('request without a cookies property (cookie-parser not registered)', async () => {
      const req = {} as unknown as AuthenticatedRequest;
      await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(session.verify).not.toHaveBeenCalled();
    });

    it('a missing cookie gives the same bare 401 as SessionService failures', async () => {
      try {
        await run().promise;
        throw new Error('expected the guard to reject');
      } catch (e) {
        expect(e).toBeInstanceOf(UnauthorizedException);
        expect((e as UnauthorizedException).getResponse()).toEqual(
          new UnauthorizedException().getResponse(),
        );
      }
    });
  });

  describe('cookie present: the guard delegates to SessionService', () => {
    it('passes the raw cookie value to SessionService.verify', async () => {
      await run('some.jwt.token').promise;

      expect(session.verify).toHaveBeenCalledTimes(1);
      expect(session.verify).toHaveBeenCalledWith('some.jwt.token');
    });

    it('rethrows the 401 from SessionService untouched', async () => {
      const unauthorized = new UnauthorizedException();
      session.verify.mockRejectedValue(unauthorized);

      const { req, promise } = run('bad.jwt.token');

      await expect(promise).rejects.toBe(unauthorized);
      expect(req.user).toBeUndefined();
    });

    it('a real failure (database down) is NOT hidden as a 401', async () => {
      const boom = new Error('db down');
      session.verify.mockRejectedValue(boom);

      const promise = run('some.jwt.token').promise;

      await expect(promise).rejects.toBe(boom);
      await expect(promise).rejects.not.toBeInstanceOf(UnauthorizedException);
    });

    it('lets the request through and attaches exactly { id, role } to the request', async () => {
      const { req, promise } = run('some.jwt.token');

      await expect(promise).resolves.toBe(true);
      expect(req.user).toEqual({ id: 'u1', role: Role.USER });
    });
  });
});

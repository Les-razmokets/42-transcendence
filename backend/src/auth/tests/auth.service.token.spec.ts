import { describe, it, expect, beforeAll } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { Argon2Hasher } from '../argon2-hasher.service';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../utils/jwt.payload';
import { Role } from '../../generated/prisma/client'; // value import: we use Role.ADMIN below

/*
 * Uses a REAL JwtModule (not a mocked JwtService), otherwise the test would only prove
 * that a mock was called. The options mirror our registerAsync factory; the real factory
 * (ConfigService, getOrThrow) is covered by the e2e login test.
 */

const SECRET = 'test-secret-only-for-unit-tests-0123456789abcdef';
const LIFETIME_SECONDS = 60;

// base64url helpers to forge tokens by hand
const b64url = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');
const fromB64url = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

describe('AuthService.issueToken', () => {
  const payload: JwtPayload = { sub: 'user-id-123', role: Role.ADMIN };

  let service: AuthService;
  let jwt: JwtService;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: SECRET,
          signOptions: { algorithm: 'HS256', expiresIn: LIFETIME_SECONDS },
        }),
      ],
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: Argon2Hasher, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    token = await service.issueToken(payload);
  });

  it('returns a compact JWT string (3 parts)', () => {
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifies with the secret and contains sub and role', async () => {
    const decoded = await jwt.verifyAsync<JwtPayload>(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
  });

  it('contains only sub, role, iat and exp (nothing readable but the essentials)', async () => {
    const decoded = await jwt.verifyAsync(token);
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
  });

  it('does not sign extra fields, even if the caller passes an object with more', async () => {
    const dirty = {
      ...payload,
      email: 'ada@example.com',
      passwordHash: '$argon2id$secret',
    } as unknown as JwtPayload;

    const dirtyToken = await service.issueToken(dirty);
    const decoded = await jwt.verifyAsync(dirtyToken);

    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
    expect(JSON.stringify(decoded)).not.toContain('ada@example.com');
    expect(JSON.stringify(decoded)).not.toContain('argon2');
  });

  it('expires after the configured lifetime (iat and exp are in seconds)', async () => {
    const { iat, exp } = await jwt.verifyAsync<{ iat: number; exp: number }>(
      token,
    );
    expect(exp - iat).toBe(LIFETIME_SECONDS);
  });

  it('is signed with HS256', () => {
    const decoded = jwt.decode(token, { complete: true }) as unknown as {
      header: { alg: string; typ: string };
    };
    expect(decoded.header.alg).toBe('HS256');
  });

  describe('tokens that must be rejected on verification', () => {
    it('rejects a token verified with another secret', async () => {
      await expect(
        jwt.verifyAsync(token, {
          secret: 'another-secret-entirely-different-0123456789',
        }),
      ).rejects.toThrow();
    });

    it('rejects a token whose payload was edited (role escalation) but not re-signed', async () => {
      const [header, body, signature] = token.split('.');
      const forgedBody = b64url({ ...fromB64url(body), role: 'SUPERUSER' });

      await expect(
        jwt.verifyAsync(`${header}.${forgedBody}.${signature}`),
      ).rejects.toThrow();
    });

    it('rejects an unsigned token (alg: none)', async () => {
      const [, body] = token.split('.');
      const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${body}.`;

      await expect(jwt.verifyAsync(unsigned)).rejects.toThrow();
    });

    it('rejects an expired token', async () => {
      const expired = await jwt.signAsync({ ...payload }, { expiresIn: -10 });
      await expect(jwt.verifyAsync(expired)).rejects.toThrow(/expired/i);
    });

    it('rejects garbage', async () => {
      await expect(jwt.verifyAsync('not.a.token')).rejects.toThrow();
    });
  });
});

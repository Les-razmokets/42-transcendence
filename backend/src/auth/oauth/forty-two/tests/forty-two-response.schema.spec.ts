import { describe, it, expect } from '@jest/globals';
import {
  OAUTH_PSEUDO_PREFIX,
  PSEUDO_MAX_LEN,
  PSEUDO_PATTERN,
} from '@transcendence/shared';
import {
  tokenResponseSchema,
  fortyTwoProfileSchema,
  pendingSignupSchema,
} from '../utils/forty-two-response.schema';

/*
 * These schemas are the trust boundary with 42: everything 42 sends goes through them
 * before reaching our code or our database.
 */

// the longest raw login that still fits once the prefix is added
const MAX_RAW_LOGIN = PSEUDO_MAX_LEN - OAUTH_PSEUDO_PREFIX.length;

describe('tokenResponseSchema', () => {
  it('accepts a response with an access_token and keeps only that field', () => {
    const parsed = tokenResponseSchema.parse({
      access_token: 'abc',
      token_type: 'bearer',
      expires_in: 7200,
      refresh_token: 'should-not-be-kept',
    });
    expect(parsed).toEqual({ access_token: 'abc' });
  });

  it.each([
    ['missing access_token', {}],
    ['access_token is not a string', { access_token: 42 }],
    ['null', null],
    ['an error payload from 42', { error: 'invalid_grant' }],
  ])('rejects %s', (_name, body) => {
    expect(tokenResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe('fortyTwoProfileSchema', () => {
  // a trimmed-down copy of what GET /v2/me returns (the real one has dozens of fields)
  const raw = (overrides: Record<string, unknown> = {}) => ({
    id: 123456,
    login: 'jdoe',
    email: 'jdoe@student.42.fr',
    first_name: 'John',
    last_name: 'Doe',
    image: { link: 'https://cdn.intra.42.fr/jdoe.jpg' },
    'staff?': false,
    ...overrides,
  });

  describe('transform', () => {
    it('maps 42 fields to our shape, and nothing else', () => {
      expect(fortyTwoProfileSchema.parse(raw())).toEqual({
        providerAccountId: '123456',
        email: 'jdoe@student.42.fr',
        login: `${OAUTH_PSEUDO_PREFIX}jdoe`,
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('turns the numeric id into a string (OAuthAccount.providerAccountId is TEXT)', () => {
      const { providerAccountId } = fortyTwoProfileSchema.parse(raw());
      expect(typeof providerAccountId).toBe('string');
    });

    it('adds the reserved prefix to the login', () => {
      const { login } = fortyTwoProfileSchema.parse(raw({ login: 'abc' }));
      expect(login).toBe(`${OAUTH_PSEUDO_PREFIX}abc`);
    });

    it('trims and lowercases the email', () => {
      const { email } = fortyTwoProfileSchema.parse(
        raw({ email: 'JDoe@Student.42.FR' }),
      );
      expect(email).toBe('jdoe@student.42.fr');
    });

    it('trims and lowercases the login', () => {
      const { login } = fortyTwoProfileSchema.parse(raw({ login: '  JDoe ' }));
      expect(login).toBe(`${OAUTH_PSEUDO_PREFIX}jdoe`);
    });
  });

  describe('the resulting pseudo always passes our own pseudo rules', () => {
    it.each(['jdoe', 'jean-luc', 'a_b', 'x1'])('%s', (login) => {
      const parsed = fortyTwoProfileSchema.parse(raw({ login }));
      expect(parsed.login).toMatch(PSEUDO_PATTERN);
      expect(parsed.login.length).toBeLessThanOrEqual(PSEUDO_MAX_LEN);
    });
  });

  describe('login length', () => {
    it(`accepts a login of ${MAX_RAW_LOGIN} chars (exactly ${PSEUDO_MAX_LEN} with the prefix)`, () => {
      const parsed = fortyTwoProfileSchema.parse(
        raw({ login: 'a'.repeat(MAX_RAW_LOGIN) }),
      );
      expect(parsed.login).toHaveLength(PSEUDO_MAX_LEN);
    });

    it(`rejects a login of ${MAX_RAW_LOGIN + 1} chars`, () => {
      expect(
        fortyTwoProfileSchema.safeParse(
          raw({ login: 'a'.repeat(MAX_RAW_LOGIN + 1) }),
        ).success,
      ).toBe(false);
    });
  });

  describe('rejects', () => {
    it.each([
      ['a login with a space', { login: 'j doe' }],
      ['a login with a dot', { login: 'j.doe' }],
      ['a login with an accent', { login: 'jérôme' }],
      ['an empty login', { login: '' }],
      ['an id sent as a string', { id: '123456' }],
      ['an invalid email', { email: 'not-an-email' }],
      ['a missing email', { email: undefined }],
      ['a missing login', { login: undefined }],
      ['a missing id', { id: undefined }],
      ['a missing first_name', { first_name: undefined }],
      ['a missing last_name', { last_name: undefined }],
    ])('%s', (_name, overrides) => {
      expect(fortyTwoProfileSchema.safeParse(raw(overrides)).success).toBe(
        false,
      );
    });

    it('a non-object body', () => {
      expect(fortyTwoProfileSchema.safeParse('jdoe').success).toBe(false);
    });
  });
});

describe('pendingSignupSchema', () => {
  const valid = () => ({
    typ: 'oauth_pending',
    providerAccountId: '123456',
    email: 'jdoe@student.42.fr',
    login: `${OAUTH_PSEUDO_PREFIX}jdoe`,
    firstName: 'John',
    lastName: 'Doe',
  });

  it('accepts a valid pending payload', () => {
    expect(pendingSignupSchema.safeParse(valid()).success).toBe(true);
  });

  it('drops the JWT claims (iat, exp) and any unknown field', () => {
    const parsed = pendingSignupSchema.parse({
      ...valid(),
      iat: 1,
      exp: 2,
      role: 'ADMIN',
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'email',
        'firstName',
        'lastName',
        'login',
        'providerAccountId',
        'typ',
      ].sort(),
    );
  });

  it.each([
    ['a session token payload (no typ)', { typ: undefined }],
    ['another typ', { typ: 'access' }],
    ['a numeric providerAccountId', { providerAccountId: 123456 }],
    ['an invalid email', { email: 'nope' }],
    ['a missing login', { login: undefined }],
  ])('rejects %s', (_name, overrides) => {
    expect(
      pendingSignupSchema.safeParse({ ...valid(), ...overrides }).success,
    ).toBe(false);
  });

  it('rejects the payload of a normal session token (sub + role)', () => {
    expect(
      pendingSignupSchema.safeParse({ sub: 'u1', role: 'USER', iat: 1, exp: 2 })
        .success,
    ).toBe(false);
  });
});

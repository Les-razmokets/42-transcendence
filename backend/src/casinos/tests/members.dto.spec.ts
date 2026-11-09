import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddMemberDto } from '../members/dto/members.dto';
import { ChangeMemberRoleDto } from '../members/dto/members.dto';
import { CasinoRole } from '../../generated/prisma/client'; // value import

/*
 * Validated the way your global ValidationPipe does it: transform + whitelist + forbidNonWhitelisted.
 *
 * ASSUMPTIONS TO CHECK:
 *  - AddMemberDto: pseudo (trimmed, lowercased, same format as register) and role (a CasinoRole). Nothing else.
 *  - ChangeMemberRoleDto: role only. The pseudo comes from the URL, so a pseudo in the body is rejected.
 *  - PSEUDO_MAX / the pseudo regex follow your register DTO (letters, digits, "_" and "-").
 */

const PSEUDO_MAX = 20;

const check = async <T extends object>(cls: new () => T, body: unknown) => {
  const instance = plainToInstance(cls, body as object);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { instance, failed: errors.map((e) => e.property).sort() };
};

describe('AddMemberDto', () => {
  const run = (body: unknown) => check(AddMemberDto, body);
  const VALID = { pseudo: 'newbie', role: CasinoRole.FLOOR };

  it.each([CasinoRole.FLOOR, CasinoRole.OWNER])(
    'accepts role %s',
    async (role) => {
      const { failed } = await run({ ...VALID, role });
      expect(failed).toEqual([]);
    },
  );

  it('trims and lowercases the pseudo (a pseudo is the same person whatever its case)', async () => {
    const { instance, failed } = await run({
      pseudo: '  NeWbIe  ',
      role: CasinoRole.FLOOR,
    });

    expect(failed).toEqual([]);
    expect(instance.pseudo).toBe('newbie');
  });

  it.each(['pseudo', 'role'])('rejects a body without %s', async (field) => {
    const body: Record<string, unknown> = { ...VALID };
    delete body[field];

    expect((await run(body)).failed).toContain(field);
  });

  it('rejects an empty body (both fields fail)', async () => {
    expect((await run({})).failed).toEqual(['pseudo', 'role']);
  });

  describe('pseudo', () => {
    it.each([
      ['empty', ''],
      ['whitespace-only', '   '],
      ['with a space inside', 'bad pseudo'],
      ['with forbidden characters', 'bad!pseudo'],
      ['with an @ (an email is not a pseudo)', 'bob@example.com'],
      ['a number', 42],
      ['null', null],
      ['an array', ['bob']],
      ['an object', { x: 1 }],
    ])('rejects a pseudo that is %s', async (_label, pseudo) => {
      expect((await run({ ...VALID, pseudo })).failed).toContain('pseudo');
    });

    it.each(['bob', 'bob_the-builder', 'user123', 'a'])(
      'accepts "%s"',
      async (pseudo) => {
        expect((await run({ ...VALID, pseudo })).failed).toEqual([]);
      },
    );

    it('length limit at its boundary: exactly the maximum passes, one more fails', async () => {
      expect(
        (await run({ ...VALID, pseudo: 'a'.repeat(PSEUDO_MAX) })).failed,
      ).toEqual([]);
      expect(
        (await run({ ...VALID, pseudo: 'a'.repeat(PSEUDO_MAX + 1) })).failed,
      ).toContain('pseudo');
    });
  });

  describe('role: only the casino roles are accepted', () => {
    it.each([
      ['the global ADMIN role', 'ADMIN'],
      ['the global USER role', 'USER'],
      ['a role that does not exist', 'STAFF'],
      ['a lowercase role', 'owner'],
      ['an empty string', ''],
      ['a number', 1],
      ['null', null],
      ['an array', [CasinoRole.OWNER]],
      ['an object', { role: CasinoRole.OWNER }],
    ])('rejects %s', async (_label, role) => {
      expect((await run({ ...VALID, role })).failed).toContain('role');
    });
  });

  describe('nothing outside pseudo and role is accepted', () => {
    it.each([
      ['userId', 'someone-else'],
      ['casinoId', 'another-casino'],
      ['id', 'membership-id'],
      ['createdAt', '2020-01-01'],
      ['deletedAt', null],
      ['globalRole', 'ADMIN'],
      ['user', { pseudo: 'x' }],
    ])(
      'rejects the extra field %s (the casino comes from the URL, never the body)',
      async (field, value) => {
        expect((await run({ ...VALID, [field]: value })).failed).toContain(
          field,
        );
      },
    );
  });
});

describe('ChangeMemberRoleDto', () => {
  const run = (body: unknown) => check(ChangeMemberRoleDto, body);

  it.each([CasinoRole.FLOOR, CasinoRole.OWNER])(
    'accepts role %s',
    async (role) => {
      expect((await run({ role })).failed).toEqual([]);
    },
  );

  it('rejects an empty body', async () => {
    expect((await run({})).failed).toContain('role');
  });

  it.each([
    ['the global ADMIN role', 'ADMIN'],
    ['the global USER role', 'USER'],
    ['a role that does not exist', 'STAFF'],
    ['a lowercase role', 'floor'],
    ['null', null],
    ['a number', 2],
    ['an array', [CasinoRole.FLOOR]],
  ])('rejects %s', async (_label, role) => {
    expect((await run({ role })).failed).toContain('role');
  });

  it.each([
    ['pseudo', 'someone'],
    ['userId', 'someone-else'],
    ['casinoId', 'another-casino'],
    ['id', 'membership-id'],
    ['deletedAt', null],
  ])(
    'rejects the extra field %s, even next to a valid role (the target comes from the URL)',
    async (field, value) => {
      expect(
        (await run({ role: CasinoRole.OWNER, [field]: value })).failed,
      ).toContain(field);
    },
  );
});

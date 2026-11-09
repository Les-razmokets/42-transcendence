import { describe, it, expect } from '@jest/globals';
import {
  myProfileUserSchema,
  myProfileWithMembershipsSchema,
} from '../utils/users-response.schemas'; // adjust paths / names to your project
import { CasinoRole } from '../../generated/prisma/client'; // value import

/*
 * The schema used ONLY by GET /users/me: the usual "my profile" fields + an always-present
 * list of memberships. Register and login keep myProfileUserSchema (no memberships).
 *
 * ASSUMPTIONS TO CHECK:
 *  - myProfileWithMembershipsSchema extends myProfileUserSchema (same fields + memberships).
 *  - Each membership is exactly { casinoId, casinoName, role }.
 *  - Plain z.object: unknown keys are stripped. If you used z.strictObject, expect a throw instead.
 */

const profile = {
  id: 'user-1',
  email: 'me@example.com',
  pseudo: 'me',
  firstName: 'Mia',
  lastName: 'Moi',
  phone: null,
  birthDate: new Date('1990-01-01'),
  role: 'USER',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-01'),
};

const membership = {
  casinoId: 'casino-1',
  casinoName: 'Casino de Lausanne',
  role: CasinoRole.FLOOR,
};

const MEMBERSHIP_KEYS = ['casinoId', 'casinoName', 'role'];

describe('myProfileWithMembershipsSchema', () => {
  it('keeps every field of the usual profile PLUS memberships', () => {
    const base = Object.keys(myProfileUserSchema.parse(profile)).sort();
    const out = Object.keys(
      myProfileWithMembershipsSchema.parse({ ...profile, memberships: [] }),
    ).sort();

    expect(out).toEqual([...base, 'memberships'].sort());
  });

  it('memberships is ALWAYS present: an empty list is valid, a missing key is not', () => {
    expect(
      myProfileWithMembershipsSchema.safeParse({ ...profile, memberships: [] })
        .success,
    ).toBe(true);
    expect(myProfileWithMembershipsSchema.safeParse(profile).success).toBe(
      false,
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['a string', 'FLOOR'],
  ])(
    'rejects memberships that is %s (it is a list, never absent)',
    (_label, memberships) => {
      expect(
        myProfileWithMembershipsSchema.safeParse({ ...profile, memberships })
          .success,
      ).toBe(false);
    },
  );

  it('keeps each membership as exactly { casinoId, casinoName, role }', () => {
    const out = myProfileWithMembershipsSchema.parse({
      ...profile,
      memberships: [membership],
    });

    expect(out.memberships).toHaveLength(1);
    expect(Object.keys(out.memberships[0]).sort()).toEqual(MEMBERSHIP_KEYS);
    expect(out.memberships[0]).toEqual(membership);
  });

  it('drops everything else a raw membership row could carry', () => {
    const out = myProfileWithMembershipsSchema.parse({
      ...profile,
      memberships: [
        {
          ...membership,
          id: 'membership-id',
          userId: 'user-1',
          createdAt: new Date(),
          casino: {
            id: 'casino-1',
            name: 'Casino de Lausanne',
            address: 'Rue du Lac 1',
            deletedAt: null,
          },
        },
      ],
    });

    expect(Object.keys(out.memberships[0]).sort()).toEqual(MEMBERSHIP_KEYS);
    expect(JSON.stringify(out.memberships)).not.toMatch(
      /membership-id|Rue du Lac|deletedAt|createdAt/,
    );
  });

  it('still drops what the profile never shows (hash, deletedAt)', () => {
    const out = myProfileWithMembershipsSchema.parse({
      ...profile,
      passwordHash: '$argon2id$should-never-be-here',
      deletedAt: null,
      memberships: [],
    }) as Record<string, unknown>;

    expect(out).not.toHaveProperty('passwordHash');
    expect(out).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(out)).not.toContain('argon2');
  });

  it.each(['casinoId', 'casinoName', 'role'])(
    'rejects a membership without %s',
    (field) => {
      const broken: Record<string, unknown> = { ...membership };
      delete broken[field];

      expect(
        myProfileWithMembershipsSchema.safeParse({
          ...profile,
          memberships: [broken],
        }).success,
      ).toBe(false);
    },
  );

  it.each(['ADMIN', 'USER', 'STAFF', 'owner'])(
    'rejects "%s" as a membership role: only casino roles (never the global role)',
    (role) => {
      expect(
        myProfileWithMembershipsSchema.safeParse({
          ...profile,
          memberships: [{ ...membership, role }],
        }).success,
      ).toBe(false);
    },
  );

  it("accepts several memberships, in the order given (ordering is the query's job)", () => {
    const out = myProfileWithMembershipsSchema.parse({
      ...profile,
      memberships: [
        { casinoId: 'a', casinoName: 'Alpha', role: CasinoRole.OWNER },
        { casinoId: 'b', casinoName: 'Beta', role: CasinoRole.FLOOR },
      ],
    });

    expect(out.memberships.map((m) => m.casinoName)).toEqual(['Alpha', 'Beta']);
  });

  it('the usual profile schema does NOT know about memberships (register and login are unchanged)', () => {
    const out = myProfileUserSchema.parse({
      ...profile,
      memberships: [membership],
    }) as Record<string, unknown>;

    expect(out).not.toHaveProperty('memberships');
  });
});

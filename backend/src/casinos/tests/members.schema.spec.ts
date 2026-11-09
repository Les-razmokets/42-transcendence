import { describe, it, expect } from '@jest/globals';
import { publicMemberSchema } from '../members/utils/members-response.schema';
import { CasinoRole } from '../../generated/prisma/client'; // value import

/*
 * The member view is a WHITELIST: a member is shown as { pseudo, role } and nothing else.
 *
 * ASSUMPTIONS TO CHECK:
 *  - memberViewSchema is a plain z.object (unknown keys are stripped, not rejected).
 *    If you used z.strictObject, the "drops unknown keys" tests must expect a throw instead.
 *  - role is validated against the CasinoRole values (remove the "unknown role" test if it is z.string()).
 */

const member = { pseudo: 'bob', role: CasinoRole.FLOOR };

describe('memberViewSchema', () => {
    it('keeps exactly pseudo and role', () => {
        const out = publicMemberSchema.parse(member);
        expect(Object.keys(out).sort()).toEqual(['pseudo', 'role']);
    });

    it('keeps the values untouched', () => {
        expect(publicMemberSchema.parse(member)).toEqual({ pseudo: 'bob', role: CasinoRole.FLOOR });
        expect(publicMemberSchema.parse({ pseudo: 'alice', role: CasinoRole.OWNER })).toEqual({
            pseudo: 'alice',
            role: CasinoRole.OWNER,
        });
    });

    it('drops everything a raw database row could carry', () => {
        const out = publicMemberSchema.parse({
            ...member,
            id: 'membership-id',
            userId: 'user-id',
            casinoId: 'casino-id',
            createdAt: new Date(),
            email: 'bob@example.com',
            firstName: 'Bob',
            lastName: 'Builder',
            passwordHash: '$argon2id$should-never-be-here',
            user: { pseudo: 'bob', email: 'bob@example.com' },
        }) as Record<string, unknown>;

        expect(Object.keys(out).sort()).toEqual(['pseudo', 'role']);
        expect(JSON.stringify(out)).not.toMatch(/argon2|@example\.com|Builder|membership-id|user-id|casino-id/);
    });

    it('does not accept the nested shape that Prisma returns before mapping ({ role, user: { pseudo } })', () => {
        // this is the 500 you get if listMembers forgets to flatten its rows
        expect(publicMemberSchema.safeParse({ role: CasinoRole.FLOOR, user: { pseudo: 'bob' } }).success).toBe(false);
    });

    it.each(['pseudo', 'role'])('rejects a member without %s', (field) => {
        const broken: Record<string, unknown> = { ...member };
        delete broken[field];

        expect(publicMemberSchema.safeParse(broken).success).toBe(false);
    });

    it.each([
        ['pseudo is a number', { pseudo: 42, role: CasinoRole.FLOOR }],
        ['pseudo is null', { pseudo: null, role: CasinoRole.FLOOR }],
        ['role is a number', { pseudo: 'bob', role: 1 }],
    ])('rejects %s', (_label, bad) => {
        expect(publicMemberSchema.safeParse(bad).success).toBe(false);
    });

    it.each(['ADMIN', 'USER', 'STAFF', 'owner', ''])(
        'rejects "%s" as a role: only casino roles can appear (never the global role)',
        (role) => {
            expect(publicMemberSchema.safeParse({ pseudo: 'bob', role }).success).toBe(false);
        },
    );

    it('works on a list of members, key by key', () => {
        const list = [member, { pseudo: 'alice', role: CasinoRole.OWNER, id: 'x' }];
        const out = list.map((m) => publicMemberSchema.parse(m));

        for (const item of out) expect(Object.keys(item).sort()).toEqual(['pseudo', 'role']);
    });
});
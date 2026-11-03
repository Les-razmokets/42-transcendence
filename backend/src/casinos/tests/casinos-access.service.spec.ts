import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CasinosAccessService } from '../casinos-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CasinoRole, Role } from '../../generated/prisma/client';

/*
 * Unit spec for the five access rules, with a stubbed Prisma (no database).
 * The e2e spec is what proves the real query filters deleted casinos and other casinos' members;
 * here we check the LOGIC around the query result, and the shape of the query we send.
 *
 * Rules, in order:
 *   1. casino missing or deleted           -> 404
 *   2. caller is ADMIN                      -> allowed (after the existence check)
 *   3. no membership at that casino         -> the SAME 404
 *   4. membership role below the minimum    -> 403
 *   5. otherwise                            -> allowed
 */

type AccessUser = Parameters<CasinosAccessService['assertAccess']>[0];

describe('CasinosAccessService.assertAccess', () => {
  const CASINO_ID = 'casino-1';

  const user = (role: Role = Role.USER, id = 'u1') =>
    ({ id, role }) as unknown as AccessUser;

  // what prisma.casino.findFirst resolves with
  const casinoWithMembers = (...roles: CasinoRole[]) => ({
    id: CASINO_ID,
    memberships: roles.map((role) => ({ role })),
  });

  let findFirst: jest.Mock<(...args: unknown[]) => Promise<unknown>>;
  let service: CasinosAccessService;

  beforeEach(() => {
    findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
    const prisma = { casino: { findFirst } } as unknown as PrismaService;
    service = new CasinosAccessService(prisma);
  });

  const capture = async (promise: Promise<unknown>) =>
    promise.then(
      () => undefined,
      (e: unknown) => e,
    );

  describe('rule 1: casino missing or deleted -> 404', () => {
    it('plain user', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN too: the existence check comes BEFORE the admin shortcut', async () => {
      findFirst.mockResolvedValue(null);
      await expect(
        service.assertAccess(user(Role.ADMIN), CASINO_ID, CasinoRole.FLOOR),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rule 2: ADMIN -> allowed', () => {
    it('without any membership, for a FLOOR route', async () => {
      findFirst.mockResolvedValue(casinoWithMembers());
      await expect(
        service.assertAccess(user(Role.ADMIN), CASINO_ID, CasinoRole.FLOOR),
      ).resolves.toBeUndefined();
    });

    it('without any membership, for an OWNER route', async () => {
      findFirst.mockResolvedValue(casinoWithMembers());
      await expect(
        service.assertAccess(user(Role.ADMIN), CASINO_ID, CasinoRole.OWNER),
      ).resolves.toBeUndefined();
    });
  });

  describe('rule 3: no membership -> the same 404', () => {
    it('a plain user who is not a member', async () => {
      findFirst.mockResolvedValue(casinoWithMembers()); // memberships: []

      const error = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR),
      );

      expect(error).toBeInstanceOf(NotFoundException); // and NOT a TypeError from reading [0].role
    });

    it('is byte-identical to the "casino does not exist" 404 (nothing reveals which case it is)', async () => {
      findFirst.mockResolvedValueOnce(null);
      const missing = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR),
      );

      findFirst.mockResolvedValueOnce(casinoWithMembers());
      const notMember = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR),
      );

      expect((notMember as NotFoundException).getResponse()).toEqual(
        (missing as NotFoundException).getResponse(),
      );
      expect((notMember as NotFoundException).getResponse()).toEqual(
        new NotFoundException().getResponse(),
      );
    });
  });

  describe('rule 4: member with a role below the minimum -> 403', () => {
    it('FLOOR on an OWNER route is refused with a 403, NOT allowed and NOT a 404', async () => {
      findFirst.mockResolvedValue(casinoWithMembers(CasinoRole.FLOOR));

      const error = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.OWNER),
      );

      expect(error).toBeInstanceOf(ForbiddenException); // "return new ..." instead of "throw new ..." fails here
      expect(error).not.toBeInstanceOf(NotFoundException);
    });

    it('the 403 is a bare ForbiddenException (does not name the required role)', async () => {
      findFirst.mockResolvedValue(casinoWithMembers(CasinoRole.FLOOR));

      const error = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.OWNER),
      );

      expect((error as ForbiddenException).getResponse()).toEqual(
        new ForbiddenException().getResponse(),
      );
    });
  });

  describe('rule 5: sufficient role -> allowed (resolves with nothing)', () => {
    it.each([
      [CasinoRole.FLOOR, CasinoRole.FLOOR],
      [CasinoRole.OWNER, CasinoRole.FLOOR], // the hierarchy: an OWNER can do everything a FLOOR can
      [CasinoRole.OWNER, CasinoRole.OWNER],
    ])('member %s on a %s route', async (memberRole, minimum) => {
      findFirst.mockResolvedValue(casinoWithMembers(memberRole));

      await expect(
        service.assertAccess(user(), CASINO_ID, minimum),
      ).resolves.toBeUndefined();
    });
  });

  describe('the query', () => {
    it('looks up the casino by id, excluding deleted ones', async () => {
      findFirst.mockResolvedValue(casinoWithMembers(CasinoRole.OWNER));

      await service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR);

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: CASINO_ID, deletedAt: null } }),
      );
    });

    it("only loads the CALLER's membership (never another user's)", async () => {
      findFirst.mockResolvedValue(casinoWithMembers(CasinoRole.OWNER));

      await service.assertAccess(
        user(Role.USER, 'caller-42'),
        CASINO_ID,
        CasinoRole.FLOOR,
      );

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            memberships: expect.objectContaining({
              where: { userId: 'caller-42' },
            }),
          }),
        }),
      );
    });

    it.each([
      ['missing casino', () => findFirst.mockResolvedValue(null)],
      ['non-member', () => findFirst.mockResolvedValue(casinoWithMembers())],
      [
        'member',
        () => findFirst.mockResolvedValue(casinoWithMembers(CasinoRole.OWNER)),
      ],
      ['admin', () => findFirst.mockResolvedValue(casinoWithMembers())],
    ])(
      'runs exactly ONE query for a %s (same path whatever the answer, no timing difference)',
      async (name, setup) => {
        setup();
        const caller = name === 'admin' ? user(Role.ADMIN) : user();

        await capture(
          service.assertAccess(caller, CASINO_ID, CasinoRole.FLOOR),
        );

        expect(findFirst).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('failures that are not access decisions', () => {
    it('a database error is NOT hidden as a 404 or a 403', async () => {
      const boom = new Error('db down');
      findFirst.mockRejectedValue(boom);

      const error = await capture(
        service.assertAccess(user(), CASINO_ID, CasinoRole.FLOOR),
      );

      expect(error).toBe(boom);
    });
  });
});

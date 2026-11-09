import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CasinosMembersService } from '../members/casinos-members.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CasinoRole, Prisma, Role } from '../../generated/prisma/client'; 

/*
 * Unit spec for the members rules, with a stubbed Prisma (no database).
 * The e2e spec proves the real queries; here we check the RULES and the shape of what we send.
 *
 * The rules (the route guard cannot see the body, so they live in the service):
 *   add     : adding an OWNER is ADMIN-only (403 BEFORE any database access); a duplicate is a 409.
 *   change  : ADMIN-only; nobody changes their own role.
 *   remove  : removing an OWNER is ADMIN-only.
 *   always  : an unknown pseudo, a deleted user and a non-member give the same bare 404.
 *
 * ASSUMPTIONS TO CHECK (rename to your real names):
 *  - listMembers(casinoId)
 *    addMember(caller, casinoId, dto)
 *    changeRole(caller, casinoId, pseudo, dto)
 *    removeMember(caller, casinoId, pseudo)
 *  - caller is { id, role } (the shape of req.user); role is the GLOBAL role.
 *  - The target user is found with prisma.user.findFirst({ where: { pseudo, deletedAt: null } }).
 *  - The membership is identified by the unique pair: { userId_casinoId: { userId, casinoId } }.
 *  - Results are the flat view { pseudo, role }.
 *  - The service normalizes the pseudo (trim + lowercase) itself. Delete that test if only the DTO does.
 *  - Changing your own role is refused with a 403.
 */

const MAX_MEMBERS = 50;

type Stub = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
type Caller = Parameters<CasinosMembersService['addMember']>[0];

const caller = (role: Role, id = 'caller-1') => ({ id, role }) as unknown as Caller;
const stub = () => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('stubbed prisma error', { code, clientVersion: 'test' });

describe('CasinoMembersService', () => {
    const CASINO = 'casino-1';
    const target = { id: 'user-9', pseudo: 'newbie' };
    const uniquePair = { userId_casinoId: { userId: target.id, casinoId: CASINO } };

    let userFindFirst: Stub;
    let findMany: Stub;
    let create: Stub;
    let findMembership: Stub;
    let update: Stub;
    let del: Stub;
    let service: CasinosMembersService;

    // what a write returns: the whole row plus the relation, to prove the service flattens it
    const fullRow = (role: CasinoRole) => ({
        id: 'membership-1',
        userId: target.id,
        casinoId: CASINO,
        role,
        createdAt: new Date(),
        user: { pseudo: target.pseudo },
    });

    const addDto = (role: CasinoRole, pseudo = target.pseudo) =>
        ({ pseudo, role }) as unknown as Parameters<CasinosMembersService['addMember']>[2];
    const roleDto = (role: CasinoRole) =>
        ({ role }) as unknown as Parameters<CasinosMembersService['changeRole']>[3];

    const capture = async (promise: Promise<unknown>) => promise.then(() => undefined, (e: unknown) => e);

    beforeEach(async () => {
        userFindFirst = stub().mockResolvedValue(target);
        findMany = stub().mockResolvedValue([]);
        create = stub().mockResolvedValue(fullRow(CasinoRole.FLOOR));
        findMembership = stub().mockResolvedValue({ role: CasinoRole.FLOOR });
        update = stub().mockResolvedValue(fullRow(CasinoRole.OWNER));
        del = stub().mockResolvedValue(fullRow(CasinoRole.FLOOR));

        const moduleRef = await Test.createTestingModule({
            providers: [
                CasinosMembersService,
                {
                    provide: PrismaService,
                    useValue: {
                        user: { findFirst: userFindFirst },
                        membership: {
                            findMany,
                            create,
                            findUnique: findMembership,
                            findFirst: findMembership,
                            update,
                            delete: del,
                        },
                    },
                },
            ],
        }).compile();

        service = moduleRef.get(CasinosMembersService);
    });

    // -------------------------------------------------------------------- list
    describe('listMembers', () => {
        it('queries the casino\'s memberships, hiding deleted users, in a stable order, capped', async () => {
            await service.listMembers(CASINO);

            const arg = findMany.mock.calls[0][0] as {
                where: { casinoId: string; user: { deletedAt: null } };
                orderBy: unknown;
                take: number;
            };
            expect(arg.where).toEqual({ casinoId: CASINO, user: { deletedAt: null } });
            expect(arg.orderBy).toEqual([{ user: { pseudo: 'asc' } }, { id: 'asc' }]);
            expect(arg.take).toBeGreaterThan(0);
            expect(arg.take).toBeLessThanOrEqual(MAX_MEMBERS);
        });

        it('selects only the role and the pseudo (no email, no names, no ids)', async () => {
            await service.listMembers(CASINO);

            const arg = findMany.mock.calls[0][0] as { select: unknown };
            expect(arg.select).toEqual({ role: true, user: { select: { pseudo: true } } });
        });

        it('flattens each row into { pseudo, role }, even if the database returns more', async () => {
            findMany.mockResolvedValue([
                { role: CasinoRole.OWNER, user: { pseudo: 'alice', email: 'a@example.com' }, id: 'm1', userId: 'u1' },
                { role: CasinoRole.FLOOR, user: { pseudo: 'bob' } },
            ]);

            const out = (await service.listMembers(CASINO)) as unknown[];

            expect(out).toEqual([
                { pseudo: 'alice', role: CasinoRole.OWNER },
                { pseudo: 'bob', role: CasinoRole.FLOOR },
            ]);
            for (const item of out) expect(Object.keys(item as object).sort()).toEqual(['pseudo', 'role']);
        });

        it('returns an empty list for a casino with no member', async () => {
            await expect(service.listMembers(CASINO)).resolves.toEqual([]);
        });
    });

    // --------------------------------------------------------------------- add
    describe('addMember', () => {
        describe('who may appoint an OWNER', () => {
            it('an OWNER (global role USER) cannot add an OWNER: 403, before ANY database access', async () => {
                const error = await capture(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.OWNER)));

                expect(error).toBeInstanceOf(ForbiddenException);
                expect(userFindFirst).not.toHaveBeenCalled();
                expect(create).not.toHaveBeenCalled();
            });

            it('an ADMIN can add an OWNER', async () => {
                create.mockResolvedValue(fullRow(CasinoRole.OWNER));

                await expect(service.addMember(caller(Role.ADMIN), CASINO, addDto(CasinoRole.OWNER))).resolves.toEqual({
                    pseudo: target.pseudo,
                    role: CasinoRole.OWNER,
                });
            });

            it.each([Role.USER, Role.ADMIN])('a %s caller can add a FLOOR member', async (role) => {
                await expect(service.addMember(caller(role), CASINO, addDto(CasinoRole.FLOOR))).resolves.toEqual({
                    pseudo: target.pseudo,
                    role: CasinoRole.FLOOR,
                });
            });

            it('the 403 is bare (it does not explain the rule)', async () => {
                const error = await capture(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.OWNER)));

                expect((error as ForbiddenException).getResponse()).toEqual(new ForbiddenException().getResponse());
            });
        });

        describe('finding the user', () => {
            it('looks up an ACTIVE user by pseudo (a deleted account cannot be added)', async () => {
                await service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR));

                expect(userFindFirst).toHaveBeenCalledWith(
                    expect.objectContaining({ where: expect.objectContaining({ pseudo: 'newbie', deletedAt: null }) }),
                );
            });

            it('normalizes the pseudo (trim + lowercase) before the lookup', async () => {
                await service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR, '  NeWbIe '));

                expect(userFindFirst).toHaveBeenCalledWith(
                    expect.objectContaining({ where: expect.objectContaining({ pseudo: 'newbie' }) }),
                );
            });

            it('an unknown or deleted pseudo: a bare 404, and nothing is created', async () => {
                userFindFirst.mockResolvedValue(null);

                const error = await capture(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR)));

                expect(error).toBeInstanceOf(NotFoundException);
                expect((error as NotFoundException).getResponse()).toEqual(new NotFoundException().getResponse());
                expect(create).not.toHaveBeenCalled();
            });
        });

        describe('the insert', () => {
            it('writes exactly the user id, the casino id (from the route) and the role', async () => {
                await service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR));

                const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
                expect(arg.data).toEqual({ userId: target.id, casinoId: CASINO, role: CasinoRole.FLOOR });
            });

            it('does not let a dirty dto choose the casino, the user or the id', async () => {
                const dirty = {
                    ...addDto(CasinoRole.FLOOR),
                    userId: 'someone-else',
                    casinoId: 'another-casino',
                    id: 'chosen-id',
                } as unknown as ReturnType<typeof addDto>;

                await service.addMember(caller(Role.USER), CASINO, dirty);

                const arg = create.mock.calls[0][0] as { data: Record<string, unknown> };
                expect(arg.data).toEqual({ userId: target.id, casinoId: CASINO, role: CasinoRole.FLOOR });
            });

            it('returns exactly { pseudo, role }: no membership id, no timestamps', async () => {
                const out = (await service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR))) as object;

                expect(Object.keys(out).sort()).toEqual(['pseudo', 'role']);
            });

            it('never changes the role of an existing member (no upsert): a duplicate is a 409', async () => {
                create.mockRejectedValue(prismaError('P2002'));

                const error = await capture(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR)));

                expect(error).toBeInstanceOf(ConflictException);
                expect(update).not.toHaveBeenCalled();
            });

            it('any other Prisma error is NOT turned into a 409', async () => {
                const other = prismaError('P2003');
                create.mockRejectedValue(other);

                await expect(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR))).rejects.toBe(other);
            });

            it('a plain database error passes through untouched', async () => {
                const boom = new Error('db down');
                create.mockRejectedValue(boom);

                await expect(service.addMember(caller(Role.USER), CASINO, addDto(CasinoRole.FLOOR))).rejects.toBe(boom);
            });
        });
    });

    // -------------------------------------------------------------- change role
    describe('changeRole', () => {
        it('a non-admin is refused with a 403 and nothing is written (second line of defence after the route)', async () => {
            const error = await capture(service.changeRole(caller(Role.USER), CASINO, target.pseudo, roleDto(CasinoRole.OWNER)));

            expect(error).toBeInstanceOf(ForbiddenException);
            expect(update).not.toHaveBeenCalled();
        });

        it('an ADMIN changes the role of the member found by pseudo, via the unique pair', async () => {
            await service.changeRole(caller(Role.ADMIN), CASINO, target.pseudo, roleDto(CasinoRole.OWNER));

            expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: uniquePair }));
            const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
            expect(arg.data).toEqual({ role: CasinoRole.OWNER });
        });

        it('returns exactly { pseudo, role }', async () => {
            const out = await service.changeRole(caller(Role.ADMIN), CASINO, target.pseudo, roleDto(CasinoRole.OWNER));

            expect(out).toEqual({ pseudo: target.pseudo, role: CasinoRole.OWNER });
        });

        it('nobody changes their OWN role, an admin included: 403, nothing written', async () => {
            userFindFirst.mockResolvedValue({ id: 'caller-1', pseudo: 'me' }); // the target IS the caller

            const error = await capture(service.changeRole(caller(Role.ADMIN, 'caller-1'), CASINO, 'me', roleDto(CasinoRole.OWNER)));

            expect(error).toBeInstanceOf(ForbiddenException);
            expect(update).not.toHaveBeenCalled();
        });

        it('an unknown or deleted pseudo: a bare 404', async () => {
            userFindFirst.mockResolvedValue(null);

            const error = await capture(service.changeRole(caller(Role.ADMIN), CASINO, 'nobody', roleDto(CasinoRole.OWNER)));

            expect(error).toBeInstanceOf(NotFoundException);
            expect((error as NotFoundException).getResponse()).toEqual(new NotFoundException().getResponse());
            expect(update).not.toHaveBeenCalled();
        });

        it('a user who is not a member of this casino: the SAME bare 404', async () => {
            findMembership.mockResolvedValue(null);
            update.mockRejectedValue(prismaError('P2025')); // whichever way your code finds out

            const error = await capture(service.changeRole(caller(Role.ADMIN), CASINO, target.pseudo, roleDto(CasinoRole.OWNER)));

            expect(error).toBeInstanceOf(NotFoundException);
            expect((error as NotFoundException).getResponse()).toEqual(new NotFoundException().getResponse());
        });

        it('a plain database error is NOT turned into a 404', async () => {
            const boom = new Error('db down');
            update.mockRejectedValue(boom);

            await expect(service.changeRole(caller(Role.ADMIN), CASINO, target.pseudo, roleDto(CasinoRole.OWNER))).rejects.toBe(boom);
        });
    });

    // ------------------------------------------------------------------ remove
    describe('removeMember', () => {
        it('an OWNER (global role USER) can remove a FLOOR member, via the unique pair', async () => {
            findMembership.mockResolvedValue({ role: CasinoRole.FLOOR });

            await expect(service.removeMember(caller(Role.USER), CASINO, target.pseudo)).resolves.toBeUndefined();

            expect(del).toHaveBeenCalledWith(expect.objectContaining({ where: uniquePair }));
        });

        it('an OWNER cannot remove an OWNER: 403 and nothing is deleted', async () => {
            findMembership.mockResolvedValue({ role: CasinoRole.OWNER });

            const error = await capture(service.removeMember(caller(Role.USER), CASINO, target.pseudo));

            expect(error).toBeInstanceOf(ForbiddenException);
            expect(del).not.toHaveBeenCalled();
        });

        it('an ADMIN can remove an OWNER', async () => {
            findMembership.mockResolvedValue({ role: CasinoRole.OWNER });

            await expect(service.removeMember(caller(Role.ADMIN), CASINO, target.pseudo)).resolves.toBeUndefined();

            expect(del).toHaveBeenCalledTimes(1);
        });

        it('an unknown or deleted pseudo: a bare 404', async () => {
            userFindFirst.mockResolvedValue(null);

            const error = await capture(service.removeMember(caller(Role.USER), CASINO, 'nobody'));

            expect(error).toBeInstanceOf(NotFoundException);
            expect((error as NotFoundException).getResponse()).toEqual(new NotFoundException().getResponse());
            expect(del).not.toHaveBeenCalled();
        });

        it('a user who is not a member of this casino: the SAME bare 404 as an unknown pseudo', async () => {
            findMembership.mockResolvedValue(null);
            del.mockRejectedValue(prismaError('P2025'));

            const notMember = await capture(service.removeMember(caller(Role.USER), CASINO, target.pseudo));

            userFindFirst.mockResolvedValue(null);
            const unknown = await capture(service.removeMember(caller(Role.USER), CASINO, 'nobody'));

            expect(notMember).toBeInstanceOf(NotFoundException);
            expect((notMember as NotFoundException).getResponse()).toEqual((unknown as NotFoundException).getResponse());
        });

        it('a plain database error is NOT turned into a 404', async () => {
            const boom = new Error('db down');
            findMembership.mockResolvedValue({ role: CasinoRole.FLOOR });
            del.mockRejectedValue(boom);

            await expect(service.removeMember(caller(Role.USER), CASINO, target.pseudo)).rejects.toBe(boom);
        });
    });
});
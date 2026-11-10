import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CasinoRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAtLeastRole } from './utils/casinos-role';
import { AuthenticatedUser } from '../auth/utils/auth-request';

/**
 * Service responsible for validating user access permissions to specific casinos.
 * It checks active casino records, membership roles, and global privileges (e.g., system admin status).
 * 
 * @param user - The currently authenticated user making the request.
 * @param casinoId - The unique identifier of the target casino.
 * @param minRole - The minimum casino role required to pass authorization.
 * @throws {NotFoundException} If the casino does not exist, is soft-deleted, or the user lacks a membership (masked as not found for security).
 * @throws {ForbiddenException} If the user's casino role is lower than the required `minRole`.
 */
@Injectable()
export class CasinosAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(
    user: AuthenticatedUser,
    casinoId: string,
    minRole: CasinoRole,
  ): Promise<void> {
    const casino = await this.prisma.casino.findFirst({
      where: { id: casinoId, deletedAt: null },
      select: {
        id: true,
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
    });
    if (!casino) throw new NotFoundException();
    else if (user.role === 'ADMIN') return;
    else if (!casino.memberships[0]) throw new NotFoundException();
    else if (!hasAtLeastRole(casino.memberships[0].role, minRole))
      throw new ForbiddenException();
  }
}

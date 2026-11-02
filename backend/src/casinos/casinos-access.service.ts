import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CasinoRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasAtLeastRole } from './utils/casinos-role';
import { AuthenticatedUser } from '../auth/utils/auth-request';

@Injectable()
export class CasinosAccessService {
  constructor(private readonly prisma: PrismaService) {}

	async assertAccess(user: AuthenticatedUser, casinoId: string, minRole: CasinoRole): Promise<void> {
    const casino = await this.prisma.casino.findFirst({
      where: { id: casinoId, deletedAt: null },
      select: {
        id: true,
        memberships: { where: { userId: user.id }, select: { role: true } },
      },
    });
    if (!casino) throw new NotFoundException();
    else if (user.role === 'ADMIN') return ;
    else if (!casino.memberships[0]) throw new NotFoundException();
    else if (!hasAtLeastRole(casino.memberships[0].role, minRole))
      throw new ForbiddenException();
  }
}
import {
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberInfo } from './utils/members.struct';
import { CasinosService } from '../casinos.service';
import { AddMemberDto, ChangeMemberRoleDto } from './dto/members.dto';
import type { AuthenticatedUser } from '../../auth/utils/auth-request';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CasinosMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly casinos: CasinosService,
  ) {}

  async listMembers(casinoId: string): Promise<MemberInfo[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { casinoId, user: { deletedAt: null } },
      orderBy: [{ user: { pseudo: 'asc' } }, { id: 'asc' }],
      take: 50,
      select: { role: true, user: { select: { pseudo: true } } },
    });
    return memberships.map((m) => ({ pseudo: m.user.pseudo, role: m.role }));
  }

  async addMember(
    caller: AuthenticatedUser,
    casinoId: string,
    dto: AddMemberDto,
  ): Promise<MemberInfo> {
    if (dto.role === 'OWNER' && caller.role !== 'ADMIN')
      throw new ForbiddenException();
    const pseudo = dto.pseudo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { pseudo, deletedAt: null },
      select: { id: true, pseudo: true },
    });
    if (!user) throw new NotFoundException();
    try {
      const membership = await this.prisma.membership.create({
        data: { userId: user.id, casinoId, role: dto.role },
        select: { role: true, user: { select: { pseudo: true } } },
      });
      return { role: membership.role, pseudo: membership.user.pseudo };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Pseudo already used in a membership.`);
      }
      throw error;
    }
  }

  async changeRole(
    caller: AuthenticatedUser,
    casinoId: string,
    pseudo: string,
    dto: ChangeMemberRoleDto,
  ): Promise<MemberInfo> {
    if (caller.role !== 'ADMIN') throw new ForbiddenException();
    const normalizedPseudo = pseudo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { pseudo: normalizedPseudo, deletedAt: null },
      select: { id: true, pseudo: true },
    });
    if (!user) throw new NotFoundException();
    if (caller.id === user.id) throw new ForbiddenException();
    try {
      const membership = await this.prisma.membership.update({
        where: {
          userId_casinoId: { casinoId, userId: user.id },
          casino: { deletedAt: null },
        },
        data: { role: dto.role },
        select: { role: true, user: { select: { pseudo: true } } },
      });
      return { role: membership.role, pseudo: membership.user.pseudo };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException();
      }
      throw error;
    }
  }

  async removeMember(
    caller: AuthenticatedUser,
    casinoId: string,
    pseudo: string,
  ): Promise<void> {
    const normalizedPseudo = pseudo.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { pseudo: normalizedPseudo, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException();
    const membership = await this.prisma.membership.findFirst({
      where: { casinoId, userId: user.id },
      select: { role: true },
    });
    if (!membership) throw new NotFoundException();
    if (membership.role === 'OWNER' && caller.role !== 'ADMIN')
      throw new ForbiddenException();
    try {
      await this.prisma.membership.delete({
        where: { userId_casinoId: { casinoId, userId: user.id } },
      });
    } catch (error) {
      throw error;
    }
  }
}

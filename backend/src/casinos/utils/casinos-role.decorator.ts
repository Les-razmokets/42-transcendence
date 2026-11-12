import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { CasinoRole } from '../../generated/prisma/client';
import { CasinoRoleGuard } from '../casinos-roles.guard';
import { CASINO_ROLE_KEY } from './casinos-role.constants';

/**
 * Custom composite NestJS decorator that secures a route by requiring a specific casino role.
 * It validates the role, attaches the required role metadata (`CASINO_ROLE_KEY`), and
 * automatically applies the `CasinoRoleGuard` to enforce access control.
 *
 * @param role - The minimum `CasinoRole` required to access the route or controller.
 * @throws {Error} If an invalid casino role is provided.
 */
export function RequireCasinoRole(role: CasinoRole) {
  if (!Object.values(CasinoRole).includes(role)) {
    throw new Error(
      `@RequireCasinoRole: invalid casino role "${String(role)}"`,
    );
  }
  return applyDecorators(
    SetMetadata(CASINO_ROLE_KEY, role),
    UseGuards(CasinoRoleGuard),
  );
}

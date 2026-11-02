import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { CasinoRole } from '../../generated/prisma/client';
import { CasinoRoleGuard } from '../casinos-roles.guard';
import { CASINO_ROLE_KEY } from './casinos-role.constants';

export function RequireCasinoRole(role: CasinoRole) {
  if (!Object.values(CasinoRole).includes(role)) {
    throw new Error(`@RequireCasinoRole: invalid casino role "${String(role)}"`);
  }
  return applyDecorators(
	  SetMetadata(CASINO_ROLE_KEY, role),
    UseGuards(CasinoRoleGuard),
  )
};

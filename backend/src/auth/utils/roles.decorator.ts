import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => {
  if (roles.length === 0) throw new Error('@Roles needs at least one role.');
  return SetMetadata(ROLES_KEY, roles);
};

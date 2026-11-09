import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

/**
 * Custom NestJS decorator that assigns required roles to a route or controller.
 * It uses NestJS's `SetMetadata` under the hood to attach the roles array to the 
 * execution context, which can then be read by a guard (e.g., RolesGuard) to enforce RBAC.
 * 
 * @param roles - One or more Prisma `Role` enums required to access the route.
 * @throws {Error} If called with zero roles.
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => {
  if (roles.length === 0) throw new Error('@Roles needs at least one role.');
  return SetMetadata(ROLES_KEY, roles);
};

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CasinosAccessService } from './casinos-access.service';
import type { CasinoRole } from '../generated/prisma/enums';
import { CASINO_ROLE_KEY } from './utils/casinos-role.constants';
import type { AuthenticatedRequest } from '../auth/utils/auth-request';

/**
 * NestJS guard that enforces casino-specific Role-Based Access Control (RBAC).
 * It ensures that the current user has the minimum required role for a specific
 * casino identified by the route parameter (`casinoId`).
 *
 * Flow:
 * 1. Reads the minimum required casino role (`CASINO_ROLE_KEY`) from the handler or class metadata. Throws if missing.
 * 2. Extracts the authenticated user from the request (`UnauthorizedException` if missing).
 * 3. Extracts and validates the `casinoId` from the route parameters (throws if invalid or missing).
 * 4. Delegates access validation to `CasinosAccessService.assertAccess()`, which verifies permissions or throws an exception.
 */
@Injectable()
export class CasinoRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly casinosAccess: CasinosAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<CasinoRole>(
      CASINO_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (minRole === undefined) throw new InternalServerErrorException();
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new UnauthorizedException();
    const casinoId = req.params.casinoId;
    if (typeof casinoId !== 'string' || casinoId === '')
      throw new InternalServerErrorException();
    await this.casinosAccess.assertAccess(req.user, casinoId, minRole);
    return true;
  }
}

import { CanActivate, ExecutionContext, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CasinosAccessService } from "./casinos-access.service";
import type { CasinoRole } from "../generated/prisma/enums";
import { CASINO_ROLE_KEY } from "./utils/casinos-role.constants";
import type  { AuthenticatedRequest } from "../auth/utils/auth-request";

@Injectable()
export class CasinoRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly casinosAccess: CasinosAccessService
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minRole = this.reflector.getAllAndOverride<CasinoRole>(CASINO_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (minRole === undefined)
      throw new InternalServerErrorException();
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user)
      throw new UnauthorizedException();
    const casinoId = req.params.casinoId;
    if (typeof casinoId !== 'string' || casinoId === '')
      throw new InternalServerErrorException();
    await this.casinosAccess.assertAccess(req.user, casinoId, minRole);
    return true;
  }
}
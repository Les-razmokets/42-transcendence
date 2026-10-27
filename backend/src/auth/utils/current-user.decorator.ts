import type { AuthenticatedUser, AuthenticatedRequest } from './auth-request';
import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

export const currentUserFactory = (
  _data: unknown,
  ctx: ExecutionContext,
): AuthenticatedUser => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) throw new InternalServerErrorException();
  return req.user;
};

export const CurrentUser = createParamDecorator(currentUserFactory);

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
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>(); // Switch to the HTTP context and retrieve the request object
  if (!req.user) throw new InternalServerErrorException();
  return req.user;
};

// Custom NestJS decorator that extracts the authenticated user from the exectution context
export const CurrentUser = createParamDecorator(currentUserFactory);

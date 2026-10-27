import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

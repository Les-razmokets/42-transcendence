import type { Request } from 'express';
import type { Role } from '../../generated/prisma/client';

// interface that contains the necessary info about an authenticated user.
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

// interface that extends the request interface with the authenticated user.
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

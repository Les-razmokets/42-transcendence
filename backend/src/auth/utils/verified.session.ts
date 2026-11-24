import { AuthenticatedUser } from './auth-request';

export interface VerifiedSession extends AuthenticatedUser {
  exp: number;
}

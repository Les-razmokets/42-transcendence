import { Role } from '../../generated/prisma/client';

// interface containing the payload of the JWT, sub = user.id, role = role.
export interface JwtPayload {
  sub: string;
  role: Role;
  // Added automatically when signing (signOptions.expiresIn in auth.module.ts),
  // in SECONDS since 1970. Optional in the type because a token signed without
  // expiresIn has none: SessionService refuses such tokens.
  exp?: number;
}

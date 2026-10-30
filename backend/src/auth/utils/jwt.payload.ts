import { Role } from '../../generated/prisma/client';

// interface containing the payload of the JWT, sub = user.id, role = role.
export interface JwtPayload {
  sub: string;
  role: Role;
}

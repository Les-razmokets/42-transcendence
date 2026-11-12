import { CasinoRole } from '../../generated/prisma/client';

/**
 * Defines the numerical ranking hierarchy for casino roles.
 * Higher numbers represent higher privilege levels.
 */
export const CASINO_ROLE_RANKING: Record<CasinoRole, number> = {
  [CasinoRole.OWNER]: 100,
  [CasinoRole.FLOOR]: 50,
};

/**
 * Checks if a user's role meets or exceeds the minimum required role rank.
 *
 * @param userRole - The role currently held by the user.
 * @param minRole - The minimum role required for access.
 * @returns `true` if the user's role rank is greater than or equal to the minimum required rank, otherwise `false`.
 */
export function hasAtLeastRole(
  userRole: CasinoRole,
  minRole: CasinoRole,
): boolean {
  const userRank = CASINO_ROLE_RANKING[userRole];
  const minRank = CASINO_ROLE_RANKING[minRole];
  if (userRank === undefined || minRank === undefined) return false;
  return userRank >= minRank;
}

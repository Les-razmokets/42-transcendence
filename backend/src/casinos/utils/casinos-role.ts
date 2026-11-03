import { CasinoRole } from '../../generated/prisma/client';

export const CASINO_ROLE_RANKING: Record<CasinoRole, number> = {
  [CasinoRole.OWNER]: 100,
  [CasinoRole.FLOOR]: 50,
};

export function hasAtLeastRole(
  userRole: CasinoRole,
  minRole: CasinoRole,
): boolean {
  const userRank = CASINO_ROLE_RANKING[userRole];
  const minRank = CASINO_ROLE_RANKING[minRole];
  if (userRank === undefined || minRank === undefined) return false;
  return userRank >= minRank;
}

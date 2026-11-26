import type { CasinoRole, MyProfileWithMemberships } from '@transcendence/shared';

// ce que l'utilisateur est pour un casino: ADMIN (tous les casinos),
// son rôle dans le casino ou null s'il n'en fait pas partie
export type CasinoAccess = 'ADMIN' | CasinoRole | null;

export function getCasinoAccess(user: MyProfileWithMemberships, casinoId: string): CasinoAccess {
  if (user.role === 'ADMIN') return 'ADMIN';
  const membership = user.memberships.find((m) => m.casinoId === casinoId);
  return membership?.role ?? null;
}

// reglages, creation et suppression de tables: OWNER du casino ou ADMIN
export function canManageCasino(access: CasinoAccess): boolean {
  return access === 'OWNER' || access === 'ADMIN';
}

// peut entrer dans l'espace admin: ADMIN, ou membre d'au moins un casino
export function hasAdminAccess(user: MyProfileWithMemberships): boolean {
  return user.role === 'ADMIN' || user.memberships.length > 0;
}

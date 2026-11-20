import type { MyProfileWithMemberships } from '@transcendence/shared';

// Faux utilisateur connecté
// OWNER du casino 1, FLOOR du casino 2 : permet de tester les deux menus.
export const currentUserMock: MyProfileWithMemberships = {
  id: 'user-1',
  email: 'owner.demo@example.com',
  pseudo: 'owner_demo',
  firstName: 'Alex',
  lastName: 'Martin',
  phone: null,
  birthDate: '1995-04-12T00:00:00.000Z',
  role: 'USER',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  memberships: [
    { casinoId: 'casino-1', casinoName: 'Casino du Lac', role: 'OWNER' },
    { casinoId: 'casino-2', casinoName: 'Casino des Alpes', role: 'FLOOR' },
  ],
};

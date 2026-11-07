import type { Table } from '@transcendence/shared';

// Une place, telle qu'elle est rangée dans une table renvoyée par l'API.
// shared n'exporte pas encore de type Seat : on le déduit du type Table.
export type Seat = Table['seats'][number];

// Pas encore de route API ni de schéma shared pour les casinos :
// forme reprise du schéma Prisma, en attendant.
export type Casino = {
  id: string;
  name: string;
  city: string;
  address: string;
  createdAt: string;
  updatedAt: string;
};

// Profil renvoyé par /auth/login, /auth/register et /users/me (myProfileUserSchema côté back).
// Pas encore dans shared : les dates arrivent en string dans le JSON.
export type User = {
  id: string;
  email: string;
  pseudo: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string;
  role: string;
  createdAt: string;
  updatedAt: string;
};

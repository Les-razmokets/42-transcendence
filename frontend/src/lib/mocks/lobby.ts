import type { Casino, PokerTable, Seat } from '../types/domain';

export const seats: Seat[] = [
  // Table 1 : 3 places libres (2, 5, 8)
  { id: 'seat-1-1', tableId: 'table-1', seatNumber: 1, status: 'OCCUPIED' },
  { id: 'seat-1-2', tableId: 'table-1', seatNumber: 2, status: 'FREE' },
  { id: 'seat-1-3', tableId: 'table-1', seatNumber: 3, status: 'OCCUPIED' },
  { id: 'seat-1-4', tableId: 'table-1', seatNumber: 4, status: 'OCCUPIED' },
  { id: 'seat-1-5', tableId: 'table-1', seatNumber: 5, status: 'FREE' },
  { id: 'seat-1-6', tableId: 'table-1', seatNumber: 6, status: 'OCCUPIED' },
  { id: 'seat-1-7', tableId: 'table-1', seatNumber: 7, status: 'OCCUPIED' },
  { id: 'seat-1-8', tableId: 'table-1', seatNumber: 8, status: 'FREE' },
  { id: 'seat-1-9', tableId: 'table-1', seatNumber: 9, status: 'OCCUPIED' },

  // Table 2 : pleine
  { id: 'seat-2-1', tableId: 'table-2', seatNumber: 1, status: 'OCCUPIED' },
  { id: 'seat-2-2', tableId: 'table-2', seatNumber: 2, status: 'OCCUPIED' },
  { id: 'seat-2-3', tableId: 'table-2', seatNumber: 3, status: 'OCCUPIED' },
  { id: 'seat-2-4', tableId: 'table-2', seatNumber: 4, status: 'OCCUPIED' },
  { id: 'seat-2-5', tableId: 'table-2', seatNumber: 5, status: 'OCCUPIED' },
  { id: 'seat-2-6', tableId: 'table-2', seatNumber: 6, status: 'OCCUPIED' },
  { id: 'seat-2-7', tableId: 'table-2', seatNumber: 7, status: 'OCCUPIED' },
  { id: 'seat-2-8', tableId: 'table-2', seatNumber: 8, status: 'OCCUPIED' },
  { id: 'seat-2-9', tableId: 'table-2', seatNumber: 9, status: 'OCCUPIED' },

  // Table 3 : en pause, places vides
  { id: 'seat-3-1', tableId: 'table-3', seatNumber: 1, status: 'FREE' },
  { id: 'seat-3-2', tableId: 'table-3', seatNumber: 2, status: 'FREE' },
  { id: 'seat-3-3', tableId: 'table-3', seatNumber: 3, status: 'FREE' },
  { id: 'seat-3-4', tableId: 'table-3', seatNumber: 4, status: 'FREE' },
  { id: 'seat-3-5', tableId: 'table-3', seatNumber: 5, status: 'FREE' },
  { id: 'seat-3-6', tableId: 'table-3', seatNumber: 6, status: 'FREE' },
  { id: 'seat-3-7', tableId: 'table-3', seatNumber: 7, status: 'FREE' },
  { id: 'seat-3-8', tableId: 'table-3', seatNumber: 8, status: 'FREE' },
  { id: 'seat-3-9', tableId: 'table-3', seatNumber: 9, status: 'FREE' },

  // Table 4 (Omaha, 6 places) : 2 places libres (2, 5)
  { id: 'seat-4-1', tableId: 'table-4', seatNumber: 1, status: 'OCCUPIED' },
  { id: 'seat-4-2', tableId: 'table-4', seatNumber: 2, status: 'FREE' },
  { id: 'seat-4-3', tableId: 'table-4', seatNumber: 3, status: 'OCCUPIED' },
  { id: 'seat-4-4', tableId: 'table-4', seatNumber: 4, status: 'OCCUPIED' },
  { id: 'seat-4-5', tableId: 'table-4', seatNumber: 5, status: 'FREE' },
  { id: 'seat-4-6', tableId: 'table-4', seatNumber: 6, status: 'OCCUPIED' },
];

export const casino: Casino = {
  id: 'casino-1',
  name: 'Casino du Lac',
  city: 'Lausanne',
  address: 'Quai du Lac 1',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

export const tables: PokerTable[] = [
  // Cas normal : ouverte, quelques places libres
  {
    id: 'table-1',
    casinoId: 'casino-1',
    name: 'Table 1',
    variant: 'TEXAS_HOLDEM',
    smallBlind: 100, // 1 CHF
    bigBlind: 200, // 2 CHF
    maxSeats: 9,
    status: 'OPEN',
    moneyOnTable: 450000, // 4500 CHF
    moneyUpdatedAt: '2026-10-14T13:30:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-14T13:30:00.000Z',
  },
  // Ouverte mais pleine (toutes ses places seront OCCUPIED)
  {
    id: 'table-2',
    casinoId: 'casino-1',
    name: 'Table 2',
    variant: 'TEXAS_HOLDEM',
    smallBlind: 200, // 2 CHF
    bigBlind: 500, // 5 CHF
    maxSeats: 9,
    status: 'OPEN',
    moneyOnTable: 1200000, // 12 000 CHF
    moneyUpdatedAt: '2026-10-14T14:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-14T14:00:00.000Z',
  },
  // En pause : invisible pour les joueurs
  {
    id: 'table-3',
    casinoId: 'casino-1',
    name: 'Table 3',
    variant: 'TEXAS_HOLDEM',
    smallBlind: 100,
    bigBlind: 200,
    maxSeats: 9,
    status: 'PAUSED',
    moneyOnTable: 0,
    moneyUpdatedAt: null, // aucun montant saisi
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-13T22:00:00.000Z',
  },
  // Omaha, moins de places
  {
    id: 'table-4',
    casinoId: 'casino-1',
    name: 'Table 4',
    variant: 'OMAHA',
    smallBlind: 100,
    bigBlind: 200,
    maxSeats: 6,
    status: 'OPEN',
    moneyOnTable: 300000, // 3000 CHF
    moneyUpdatedAt: '2026-10-14T12:45:00.000Z',
    createdAt: '2026-09-15T10:00:00.000Z',
    updatedAt: '2026-10-14T12:45:00.000Z',
  },
];

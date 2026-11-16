import type { PublicCasino, Table } from '@transcendence/shared';

export const casino: PublicCasino = {
  id: 'casino-1',
  name: 'Casino du lac',
  city: 'Lausanne',
  address: 'Quai du lac 1',
};

export const tables: Table[] = [
  // Cas normal : 3 places libres sur 9 (2, 5, 8)
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
    seats: [
      { id: 'seat-1-1', seatNumber: 1, status: 'OCCUPIED' },
      { id: 'seat-1-2', seatNumber: 2, status: 'FREE' },
      { id: 'seat-1-3', seatNumber: 3, status: 'OCCUPIED' },
      { id: 'seat-1-4', seatNumber: 4, status: 'OCCUPIED' },
      { id: 'seat-1-5', seatNumber: 5, status: 'FREE' },
      { id: 'seat-1-6', seatNumber: 6, status: 'OCCUPIED' },
      { id: 'seat-1-7', seatNumber: 7, status: 'OCCUPIED' },
      { id: 'seat-1-8', seatNumber: 8, status: 'FREE' },
      { id: 'seat-1-9', seatNumber: 9, status: 'OCCUPIED' },
    ],
  },
  // Ouverte mais pleine
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
    seats: [
      { id: 'seat-2-1', seatNumber: 1, status: 'OCCUPIED' },
      { id: 'seat-2-2', seatNumber: 2, status: 'OCCUPIED' },
      { id: 'seat-2-3', seatNumber: 3, status: 'OCCUPIED' },
      { id: 'seat-2-4', seatNumber: 4, status: 'OCCUPIED' },
      { id: 'seat-2-5', seatNumber: 5, status: 'OCCUPIED' },
      { id: 'seat-2-6', seatNumber: 6, status: 'OCCUPIED' },
      { id: 'seat-2-7', seatNumber: 7, status: 'OCCUPIED' },
      { id: 'seat-2-8', seatNumber: 8, status: 'OCCUPIED' },
      { id: 'seat-2-9', seatNumber: 9, status: 'OCCUPIED' },
    ],
  },
  // En pause : invisible pour les joueurs, visible pour le personnel du casino
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
    seats: [
      { id: 'seat-3-1', seatNumber: 1, status: 'FREE' },
      { id: 'seat-3-2', seatNumber: 2, status: 'FREE' },
      { id: 'seat-3-3', seatNumber: 3, status: 'FREE' },
      { id: 'seat-3-4', seatNumber: 4, status: 'FREE' },
      { id: 'seat-3-5', seatNumber: 5, status: 'FREE' },
      { id: 'seat-3-6', seatNumber: 6, status: 'FREE' },
      { id: 'seat-3-7', seatNumber: 7, status: 'FREE' },
      { id: 'seat-3-8', seatNumber: 8, status: 'FREE' },
      { id: 'seat-3-9', seatNumber: 9, status: 'FREE' },
    ],
  },
  // Omaha, 6 places : 2 libres (2, 5)
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
    seats: [
      { id: 'seat-4-1', seatNumber: 1, status: 'OCCUPIED' },
      { id: 'seat-4-2', seatNumber: 2, status: 'FREE' },
      { id: 'seat-4-3', seatNumber: 3, status: 'OCCUPIED' },
      { id: 'seat-4-4', seatNumber: 4, status: 'OCCUPIED' },
      { id: 'seat-4-5', seatNumber: 5, status: 'FREE' },
      { id: 'seat-4-6', seatNumber: 6, status: 'OCCUPIED' },
    ],
  },
];

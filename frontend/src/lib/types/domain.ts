import type { SeatStatus, PokerVariant, TableStatus } from '@transcendence/shared';
export type { SeatStatus, PokerVariant, TableStatus };

export type Seat = {
  id: string;
  tableId: string;
  seatNumber: number;
  status: SeatStatus;
};

export type Casino = {
  id: string;
  name: string;
  city: string;
  address: string;
  createdAt: string;
  updatedAt: string;
};

export type PokerTable = {
  id: string;
  casinoId: string;
  name: string;
  variant: PokerVariant;
  smallBlind: number;
  bigBlind: number;
  maxSeats: number;
  status: TableStatus;
  moneyOnTable: number;
  moneyUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

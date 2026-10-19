export type SeatStatus = 'FREE' | 'OCCUPIED';
export type PokerVariant = 'OMAHA' | 'TEXAS_HOLDEM';
export type TableStatus = 'OPEN' | 'PAUSED';

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

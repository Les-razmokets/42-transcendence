-- CreateEnum
CREATE TYPE "PokerVariant" AS ENUM ('TEXAS_HOLDEM', 'OMAHA');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('OPEN', 'PAUSED');

-- CreateEnum
CREATE TYPE "SeatStatus" AS ENUM ('FREE', 'OCCUPIED');

-- CreateTable
CREATE TABLE "PokerTable" (
    "id" TEXT NOT NULL,
    "casinoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variant" "PokerVariant" NOT NULL,
    "smallBlind" INTEGER NOT NULL,
    "bigBlind" INTEGER NOT NULL,
    "maxSeats" INTEGER NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'OPEN',
    "moneyOnTable" INTEGER NOT NULL DEFAULT 0,
    "moneyUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PokerTable_pkey" PRIMARY KEY ("id")
);

-- CheckConstraints
ALTER TABLE "PokerTable" ADD CONSTRAINT "poker_table_max_seats_check" CHECK ("maxSeats" BETWEEN 2 AND 10);
ALTER TABLE "PokerTable" ADD CONSTRAINT "poker_table_omaha_max_seats_check" CHECK ("variant" <> 'OMAHA' OR "maxSeats" <= 8);
ALTER TABLE "PokerTable" ADD CONSTRAINT "poker_table_blinds_positive_check" CHECK ("smallBlind" > 0 AND "bigBlind" > 0);
ALTER TABLE "PokerTable" ADD CONSTRAINT "poker_table_big_blind_check" CHECK ("bigBlind" >= "smallBlind");

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "status" "SeatStatus" NOT NULL DEFAULT 'FREE',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seat_tableId_seatNumber_key" ON "Seat"("tableId", "seatNumber");

-- AddForeignKey
ALTER TABLE "PokerTable" ADD CONSTRAINT "PokerTable_casinoId_fkey" FOREIGN KEY ("casinoId") REFERENCES "Casino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "PokerTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

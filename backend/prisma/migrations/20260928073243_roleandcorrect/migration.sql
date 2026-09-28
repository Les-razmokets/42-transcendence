/*
  Warnings:

  - You are about to drop the column `adress` on the `Casino` table. All the data in the column will be lost.
  - You are about to drop the column `isAdmin` on the `User` table. All the data in the column will be lost.
  - Added the required column `address` to the `Casino` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Casino" DROP CONSTRAINT "Casino_ownerId_fkey";

-- AlterTable
ALTER TABLE "Casino" DROP COLUMN "adress",
ADD COLUMN     "address" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "isAdmin";

-- AddForeignKey
ALTER TABLE "Casino" ADD CONSTRAINT "Casino_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

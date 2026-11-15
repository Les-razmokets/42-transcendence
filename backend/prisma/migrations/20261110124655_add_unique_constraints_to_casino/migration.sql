/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Casino` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[address]` on the table `Casino` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Casino_name_key" ON "Casino"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Casino_address_key" ON "Casino"("address");

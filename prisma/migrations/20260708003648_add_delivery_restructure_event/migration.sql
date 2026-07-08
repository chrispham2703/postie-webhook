/*
  Warnings:

  - You are about to drop the column `eventId` on the `delivery_attempts` table. All the data in the column will be lost.
  - You are about to drop the column `attemptCount` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `endpointId` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `nextAttemptAt` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `events` table. All the data in the column will be lost.
  - You are about to drop the column `targetUrl` on the `events` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[messageId]` on the table `events` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deliveryId` to the `delivery_attempts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "delivery_attempts" DROP CONSTRAINT "delivery_attempts_eventId_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_endpointId_fkey";

-- DropIndex
DROP INDEX "delivery_attempts_eventId_idx";

-- DropIndex
DROP INDEX "events_endpointId_idx";

-- DropIndex
DROP INDEX "events_nextAttemptAt_idx";

-- AlterTable
ALTER TABLE "delivery_attempts" DROP COLUMN "eventId",
ADD COLUMN     "deliveryId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "events" DROP COLUMN "attemptCount",
DROP COLUMN "endpointId",
DROP COLUMN "nextAttemptAt",
DROP COLUMN "status",
DROP COLUMN "targetUrl",
ADD COLUMN     "messageId" TEXT;

-- CreateTable
CREATE TABLE "deliveries" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliveries_nextAttemptAt_idx" ON "deliveries"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "deliveries_endpointId_idx" ON "deliveries"("endpointId");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_eventId_endpointId_key" ON "deliveries"("eventId", "endpointId");

-- CreateIndex
CREATE INDEX "delivery_attempts_deliveryId_idx" ON "delivery_attempts"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "events_messageId_key" ON "events"("messageId");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - Added the required column `appId` to the `endpoints` table without a default value. This is not possible if the table is not empty.
  - Added the required column `secret` to the `endpoints` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `endpoints` table without a default value. This is not possible if the table is not empty.
  - Added the required column `appId` to the `events` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "endpoints" ADD COLUMN     "appId" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filterTypes" TEXT[],
ADD COLUMN     "headers" JSONB,
ADD COLUMN     "secret" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "appId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uid" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_orgId_idx" ON "applications"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "applications_orgId_uid_key" ON "applications"("orgId", "uid");

-- CreateIndex
CREATE INDEX "endpoints_appId_idx" ON "endpoints"("appId");

-- CreateIndex
CREATE INDEX "events_appId_idx" ON "events"("appId");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_appId_fkey" FOREIGN KEY ("appId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_appId_fkey" FOREIGN KEY ("appId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

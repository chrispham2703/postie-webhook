-- AlterTable
ALTER TABLE "events" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "events_nextAttemptAt_idx" ON "events"("nextAttemptAt");

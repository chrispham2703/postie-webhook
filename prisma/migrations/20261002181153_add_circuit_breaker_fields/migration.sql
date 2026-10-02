-- AlterTable
ALTER TABLE "endpoints" ADD COLUMN     "failureSince" TIMESTAMP(3),
ADD COLUMN     "pausedUntil" TIMESTAMP(3);

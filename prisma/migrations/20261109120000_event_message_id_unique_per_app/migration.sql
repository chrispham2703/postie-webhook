-- DropIndex
DROP INDEX "events_messageId_key";

-- CreateIndex
CREATE UNIQUE INDEX "events_appId_messageId_key" ON "events"("appId", "messageId");


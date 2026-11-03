-- AlterTable
ALTER TABLE "events" ADD COLUMN     "duplicateOfId" TEXT;

-- CreateTable
CREATE TABLE "admin_memos" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_memos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_duplicateOfId_idx" ON "events"("duplicateOfId");

-- CreateIndex
CREATE INDEX "admin_memos_kind_idx" ON "admin_memos"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "admin_memos_kind_key_key" ON "admin_memos"("kind", "key");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

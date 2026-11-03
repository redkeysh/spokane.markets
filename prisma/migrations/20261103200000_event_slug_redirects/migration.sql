-- CreateTable
CREATE TABLE "event_slug_redirects" (
    "slug" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_slug_redirects_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "event_slug_redirects_eventId_idx" ON "event_slug_redirects"("eventId");

-- AddForeignKey
ALTER TABLE "event_slug_redirects" ADD CONSTRAINT "event_slug_redirects_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

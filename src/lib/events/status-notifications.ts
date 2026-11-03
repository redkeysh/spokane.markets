import type { EventStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

/**
 * Tells an event's submitter it was published or rejected, unless they turned
 * organizer alerts off. Does nothing when the status did not change.
 */
export async function notifySubmitterOfStatusChange(params: {
  submittedById: string | null;
  previousStatus: EventStatus;
  newStatus: EventStatus;
  event: { id: string; title: string; slug: string };
}): Promise<void> {
  const { submittedById, previousStatus, newStatus, event } = params;
  if (!submittedById || newStatus === previousStatus) return;

  const prefs = await db.notificationPreference.findUnique({ where: { userId: submittedById } });
  if (prefs?.organizerAlertsEnabled === false) return;

  if (newStatus === "PUBLISHED") {
    await createNotification({
      userId: submittedById,
      type: "EVENT_PUBLISHED",
      title: "Your event is now published",
      body: `"${event.title}" is now live and visible to visitors.`,
      link: `/events/${event.slug}`,
      objectType: "event",
      objectId: event.id,
      metadata: { eventTitle: event.title, eventSlug: event.slug },
    });
  } else if (newStatus === "REJECTED") {
    await createNotification({
      userId: submittedById,
      type: "EVENT_REJECTED",
      title: "Your event was not approved",
      body: `"${event.title}" was not approved for publication.`,
      link: `/organizer/events/${event.id}/edit`,
      objectType: "event",
      objectId: event.id,
      metadata: { eventTitle: event.title },
    });
  }
}

import type { Event } from "@prisma/client";
import { db } from "@/lib/db";

export interface EventWithMarket extends Event {
  market?: {
    ownerId: string | null;
    memberships?: Array<{
      userId: string;
      role: "OWNER" | "MANAGER" | "VOLUNTEER" | "STAFF";
    }>;
  } | null;
}

/**
 * Returns true if the user can manage the event roster (approve, reject, add, remove vendors).
 * Organizer = event submitter OR market owner (when event has market) OR admin.
 */
export function canManageEventRoster(
  userId: string,
  event: EventWithMarket,
  userRole?: string
): boolean {
  if (userRole === "ADMIN") return true;
  if (event.submittedById === userId) return true;
  if (event.market?.ownerId === userId) return true;
  if (
    event.market?.memberships?.some(
      (m) => m.userId === userId && (m.role === "OWNER" || m.role === "MANAGER")
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Loads an event together with the market and its OWNER/MANAGER memberships,
 * which is exactly what canManageEventRoster needs. Roster handlers must load
 * the event through this helper: a bare `include: { market: true }` omits
 * `market.memberships`, so the membership branch of the guard silently never
 * matches and legitimate market managers are denied.
 */
export function loadEventForRosterAuth(eventId: string) {
  return db.event.findUnique({
    where: { id: eventId },
    include: {
      market: {
        include: {
          memberships: {
            where: { role: { in: ["OWNER", "MANAGER"] } },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });
}

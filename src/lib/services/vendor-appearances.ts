import { db } from "@/lib/db";
import { VENDOR_PROFILE_INTENT_STATUSES } from "@/lib/vendor-public-events";
import type { Event, Venue, Tag, Feature } from "@prisma/client";

export const vendorAppearanceEventInclude = {
  venue: true,
  tags: true,
  features: true,
  _count: { select: { vendorEvents: true } },
  scheduleDays: { orderBy: { date: "asc" as const } },
} as const;

export type VendorAppearanceEvent = Event & {
  venue: Venue;
  tags: Tag[];
  features: Feature[];
  _count: { vendorEvents: number };
  scheduleDays: { date: Date; startTime: string; endTime: string; allDay: boolean }[];
};

export type VendorAppearanceKind = "official_roster" | "vendor_linked" | "intent";

export interface VendorAppearanceRow {
  event: VendorAppearanceEvent;
  kind: VendorAppearanceKind;
}

const ROSTER_ACTIVE = ["INVITED", "ACCEPTED", "CONFIRMED"] as const;

function kindPriority(k: VendorAppearanceKind): number {
  switch (k) {
    case "official_roster":
      return 3;
    case "vendor_linked":
      return 2;
    case "intent":
      return 1;
    default:
      return 0;
  }
}

function pickKind(a: VendorAppearanceKind, b: VendorAppearanceKind): VendorAppearanceKind {
  return kindPriority(a) >= kindPriority(b) ? a : b;
}

/**
 * Merge roster, vendor-linked events, and qualifying intents into deduped rows with a display kind.
 */
export async function getVendorAppearances(
  vendorProfileId: string,
): Promise<{ rows: VendorAppearanceRow[] }> {
  const [vendorEvents, intents, roster] = await Promise.all([
    db.vendorEvent.findMany({
      where: {
        vendorProfileId,
        event: { deletedAt: null, status: "PUBLISHED" },
      },
      include: { event: { include: vendorAppearanceEventInclude } },
    }),
    db.eventVendorIntent.findMany({
      where: {
        vendorProfileId,
        status: { in: VENDOR_PROFILE_INTENT_STATUSES },
        event: { deletedAt: null, status: "PUBLISHED" },
      },
      include: { event: { include: vendorAppearanceEventInclude } },
    }),
    db.eventVendorRoster.findMany({
      where: {
        vendorProfileId,
        status: { in: [...ROSTER_ACTIVE] },
        event: { deletedAt: null, status: "PUBLISHED" },
      },
      include: { event: { include: vendorAppearanceEventInclude } },
    }),
  ]);

  const byId = new Map<string, VendorAppearanceRow>();

  const upsert = (event: VendorAppearanceEvent, kind: VendorAppearanceKind) => {
    const existing = byId.get(event.id);
    if (!existing) {
      byId.set(event.id, { event, kind });
      return;
    }
    byId.set(event.id, {
      event: existing.event,
      kind: pickKind(existing.kind, kind),
    });
  };

  for (const ve of vendorEvents) {
    upsert(ve.event as VendorAppearanceEvent, "vendor_linked");
  }
  for (const r of roster) {
    upsert(r.event as VendorAppearanceEvent, "official_roster");
  }
  for (const vi of intents) {
    upsert(vi.event as VendorAppearanceEvent, "intent");
  }

  const rows = Array.from(byId.values()).sort(
    (a, b) => a.event.startDate.getTime() - b.event.startDate.getTime(),
  );

  return { rows };
}

export function splitAppearancesByTime(
  rows: VendorAppearanceRow[],
  now: Date = new Date(),
  opts?: { pastLimit?: number },
): {
  upcoming: VendorAppearanceRow[];
  past: VendorAppearanceRow[];
} {
  const pastLimit = opts?.pastLimit ?? 24;
  // An event is upcoming/current until it ends. Classifying by startDate alone
  // pushed in-progress multi-day events into "past", where the limit could drop
  // them from the list entirely.
  const upcoming = rows.filter((r) => r.event.endDate >= now);
  const past = rows
    .filter((r) => r.event.endDate < now)
    .sort((a, b) => b.event.startDate.getTime() - a.event.startDate.getTime())
    .slice(0, pastLimit);
  return { upcoming, past };
}

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decisionDetails, type DecisionRef } from "@/lib/admin/decision-details";

/** Values written to the kept place in the merge's transaction; omitted fields keep its own. */
export type MergeOverrides = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  neighborhood?: string | null;
  parkingNotes?: string | null;
  lat?: number;
  lng?: number;
};

export type MergeVenuesResult =
  | { ok: true; keepId: string; eventsMoved: number; marketsMoved: number; eventSlugs: string[]; marketSlugs: string[] }
  | { ok: false; error: string };

export type MergeOptions = DecisionRef & {
  overrides?: MergeOverrides;
  /** Spread into the audit metadata, e.g. { via: "mcp", tokenId }. */
  auditMeta?: Record<string, unknown>;
};

const OVERRIDE_FIELDS = ["name", "address", "city", "state", "zip", "neighborhood", "parkingNotes", "lat", "lng"] as const;
type OverrideField = (typeof OVERRIDE_FIELDS)[number];
type KeepRow = Record<OverrideField, unknown> & { id: string; name: string; address: string; deletedAt: Date | null };

/**
 * The kept place's field changes: the overrides that differ from its values, then a neighborhood
 * or parking notes it lacks, taken from the first duplicate that has one.
 */
export function keepChanges(
  keep: KeepRow,
  duplicates: { neighborhood: string | null; parkingNotes: string | null }[],
  overrides: MergeOverrides = {}
): { previous: Record<string, unknown>; next: Record<string, unknown> } {
  const next: Record<string, unknown> = {};
  for (const field of OVERRIDE_FIELDS) {
    const value = overrides[field];
    if (value !== undefined && value !== keep[field]) next[field] = value;
  }
  if (!("neighborhood" in overrides) && !keep.neighborhood) {
    const found = duplicates.find((d) => d.neighborhood)?.neighborhood;
    if (found) next.neighborhood = found;
  }
  if (!("parkingNotes" in overrides) && !keep.parkingNotes) {
    const found = duplicates.find((d) => d.parkingNotes)?.parkingNotes;
    if (found) next.parkingNotes = found;
  }
  const previous = Object.fromEntries(Object.keys(next).map((field) => [field, keep[field as OverrideField] ?? null]));
  return { previous, next };
}

/**
 * Moves every event and market from the duplicate places onto the kept place, writes the
 * overrides (and a neighborhood or parking notes the kept place lacks) to it, and archives the
 * duplicates, all in one transaction with its MERGE_VENUES audit entry. The entry records the
 * moved event and market ids with the place each came from, the kept place's previous values
 * and the archived ids, so undoDecision can put everything back.
 */
export async function mergeVenues(
  keepId: string,
  mergeIds: string[],
  actorId: string,
  options: MergeOptions = {}
): Promise<MergeVenuesResult> {
  const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (ids.length === 0) {
    return { ok: false, error: "Pick at least one other place to merge." };
  }

  return db.$transaction(async (tx) => {
    const keep = await tx.venue.findUnique({ where: { id: keepId } });
    if (!keep || keep.deletedAt) {
      return { ok: false as const, error: "The place to keep no longer exists or is archived." };
    }
    const duplicates = await tx.venue.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (duplicates.length !== ids.length) {
      return { ok: false as const, error: "One of the places to merge no longer exists or is already archived." };
    }

    const { previous, next } = keepChanges(keep, duplicates, options.overrides);
    const name = (next.name as string | undefined) ?? keep.name;
    const address = (next.address as string | undefined) ?? keep.address;
    if (next.name !== undefined || next.address !== undefined) {
      const taken = await tx.venue.findFirst({ where: { name, address, id: { not: keepId } }, select: { id: true, name: true } });
      if (taken) {
        return {
          ok: false as const,
          error: ids.includes(taken.id)
            ? `${taken.name} already has this name and address. Keep that record instead.`
            : `Another place, ${taken.name}, already has this name and address.`,
        };
      }
    }

    const events = await tx.event.findMany({ where: { venueId: { in: ids } }, select: { id: true, venueId: true, slug: true } });
    const markets = await tx.market.findMany({ where: { venueId: { in: ids } }, select: { id: true, venueId: true, slug: true } });
    const at = new Date();
    if (events.length > 0) {
      await tx.event.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { venueId: keepId, updatedAt: at } });
    }
    if (markets.length > 0) {
      await tx.market.updateMany({ where: { id: { in: markets.map((m) => m.id) } }, data: { venueId: keepId } });
    }
    if (Object.keys(next).length > 0) {
      await tx.venue.update({ where: { id: keepId }, data: next as Prisma.VenueUpdateInput });
    }
    await tx.venue.updateMany({ where: { id: { in: ids } }, data: { deletedAt: at } });

    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "MERGE_VENUES",
        targetType: "VENUE",
        targetId: keepId,
        metadata: {
          mergedIds: ids,
          mergedNames: duplicates.map((d) => d.name),
          eventsMoved: events.length,
          marketsMoved: markets.length,
          moved: {
            events: events.map((e) => ({ id: e.id, fromVenueId: e.venueId })),
            markets: markets.map((m) => ({ id: m.id, fromVenueId: m.venueId })),
          },
          previousValue: previous,
          newValue: next,
          details: { title: name, at: at.toISOString(), ...decisionDetails(options) },
          ...options.auditMeta,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      ok: true as const,
      keepId,
      eventsMoved: events.length,
      marketsMoved: markets.length,
      eventSlugs: events.map((e) => e.slug),
      marketSlugs: markets.map((m) => m.slug),
    };
  });
}

export type MoveListingsResult =
  | { ok: true; eventsMoved: number; marketsMoved: number; eventSlugs: string[]; marketSlugs: string[] }
  | { ok: false; error: string };

/**
 * Moves every event and market of one place (usually an archived one still in use) to an active
 * place, leaving both places as they are. Audited as a MERGE_VENUES entry on the receiving place
 * that archives nothing, so undoDecision moves the listings back and nothing else.
 */
export async function moveVenueListings(
  fromId: string,
  toId: string,
  actorId: string,
  options: DecisionRef & { auditMeta?: Record<string, unknown> } = {}
): Promise<MoveListingsResult> {
  if (fromId === toId) return { ok: false, error: "Pick a different place to move the listings to." };
  return db.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.venue.findUnique({ where: { id: fromId }, select: { id: true, name: true } }),
      tx.venue.findUnique({ where: { id: toId }, select: { id: true, name: true, deletedAt: true } }),
    ]);
    if (!from) return { ok: false as const, error: "The place to move from no longer exists." };
    if (!to || to.deletedAt) return { ok: false as const, error: "The place to move to no longer exists or is archived." };

    const events = await tx.event.findMany({ where: { venueId: fromId }, select: { id: true, slug: true } });
    const markets = await tx.market.findMany({ where: { venueId: fromId }, select: { id: true, slug: true } });
    if (events.length === 0 && markets.length === 0) {
      return { ok: false as const, error: `Nothing uses ${from.name} any more.` };
    }
    const at = new Date();
    if (events.length > 0) {
      await tx.event.updateMany({ where: { id: { in: events.map((e) => e.id) } }, data: { venueId: toId, updatedAt: at } });
    }
    if (markets.length > 0) {
      await tx.market.updateMany({ where: { id: { in: markets.map((m) => m.id) } }, data: { venueId: toId } });
    }
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "MERGE_VENUES",
        targetType: "VENUE",
        targetId: toId,
        metadata: {
          mergedIds: [],
          mergedNames: [],
          movedFrom: { id: from.id, name: from.name },
          eventsMoved: events.length,
          marketsMoved: markets.length,
          moved: {
            events: events.map((e) => ({ id: e.id, fromVenueId: fromId })),
            markets: markets.map((m) => ({ id: m.id, fromVenueId: fromId })),
          },
          details: { title: to.name, at: at.toISOString(), ...decisionDetails(options) },
          ...options.auditMeta,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      ok: true as const,
      eventsMoved: events.length,
      marketsMoved: markets.length,
      eventSlugs: events.map((e) => e.slug),
      marketSlugs: markets.map((m) => m.slug),
    };
  });
}

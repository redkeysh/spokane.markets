import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export type MergeVenuesResult =
  | { ok: true; eventsMoved: number; marketsMoved: number }
  | { ok: false; error: string };

/**
 * Moves every event and market from the duplicate venues onto the kept venue,
 * copies over a neighborhood or parking notes the kept venue lacks, and
 * archives the duplicates. Runs in one transaction.
 */
export async function mergeVenues(
  keepId: string,
  mergeIds: string[],
  actorId: string
): Promise<MergeVenuesResult> {
  const ids = [...new Set(mergeIds)].filter((id) => id !== keepId);
  if (ids.length === 0) {
    return { ok: false, error: "Pick at least one other venue to merge." };
  }

  const outcome = await db.$transaction(async (tx) => {
    const keep = await tx.venue.findUnique({ where: { id: keepId } });
    if (!keep || keep.deletedAt) {
      return { ok: false as const, error: "The venue to keep no longer exists or is archived." };
    }
    const duplicates = await tx.venue.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (duplicates.length !== ids.length) {
      return {
        ok: false as const,
        error: "One of the venues to merge no longer exists or is already archived.",
      };
    }

    const events = await tx.event.updateMany({
      where: { venueId: { in: ids } },
      data: { venueId: keepId },
    });
    const markets = await tx.market.updateMany({
      where: { venueId: { in: ids } },
      data: { venueId: keepId },
    });

    const neighborhood = keep.neighborhood ?? duplicates.find((d) => d.neighborhood)?.neighborhood ?? null;
    const parkingNotes = keep.parkingNotes ?? duplicates.find((d) => d.parkingNotes)?.parkingNotes ?? null;
    if (neighborhood !== keep.neighborhood || parkingNotes !== keep.parkingNotes) {
      await tx.venue.update({ where: { id: keepId }, data: { neighborhood, parkingNotes } });
    }

    await tx.venue.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });

    return {
      ok: true as const,
      eventsMoved: events.count,
      marketsMoved: markets.count,
      mergedNames: duplicates.map((d) => d.name),
    };
  });

  if (!outcome.ok) return outcome;

  await logAudit(actorId, "MERGE_VENUES", "VENUE", keepId, {
    mergedIds: ids,
    mergedNames: outcome.mergedNames,
    eventsMoved: outcome.eventsMoved,
    marketsMoved: outcome.marketsMoved,
  });

  return { ok: true, eventsMoved: outcome.eventsMoved, marketsMoved: outcome.marketsMoved };
}

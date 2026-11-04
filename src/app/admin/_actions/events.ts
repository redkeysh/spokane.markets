"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import {
  archiveEvents,
  EventMutationError,
  restoreEvents,
  setEventStatuses,
  updateEventFields,
  type EventFieldChanges,
} from "@/lib/events/mutations";

/** Every bulk action of the Events list is one decision, so one Undo reverses all of it. */
const DECISION_KEY = "events-list";

const MAX_IDS = 500;

const idSchema = z.string().trim().min(1).max(64);
const idsSchema = z.array(idSchema).min(1).max(MAX_IDS);

export type BulkFailure = { id: string; reason: string };

export type BulkOutcome =
  | {
      ok: true;
      /** Null when nothing changed, so there is nothing to undo. */
      decisionId: string | null;
      changed: string[];
      /** Already as asked: already live, already in that market, already tagged. */
      already: string[];
      /** Left as they were, each with the reason. */
      failed: BulkFailure[];
      /** People a publish or rejection told. */
      notified: string[];
    }
  | { ok: false; message: string };

export type UndoOutcome = { ok: boolean; message: string };

function invalid(error: z.ZodError): BulkOutcome {
  return { ok: false, message: error.issues[0]?.message ?? "That request was not valid." };
}

function failure(err: unknown): BulkOutcome {
  if (err instanceof EventMutationError) return { ok: false, message: err.message };
  throw err;
}

function outcome(
  decisionId: string,
  parts: { changed: string[]; already?: string[]; failed?: BulkFailure[]; notified?: string[] }
): BulkOutcome {
  return {
    ok: true,
    decisionId: parts.changed.length > 0 ? decisionId : null,
    changed: parts.changed,
    already: parts.already ?? [],
    failed: parts.failed ?? [],
    notified: parts.notified ?? [],
  };
}

/** Puts the events on the site. Events whose place is archived or incomplete stay as they are. */
export async function publishEventsAction(input: { ids: string[] }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const decisionId = newDecisionId();
  try {
    const result = await setEventStatuses(parsed.data.ids, "PUBLISHED", session.user.id, {
      decisionId,
      decisionKey: DECISION_KEY,
    });
    revalidateAdmin();
    return outcome(decisionId, {
      changed: result.changed,
      already: result.alreadyThere,
      failed: [...result.refused, ...result.missing.map((id) => ({ id, reason: "It was archived or removed." }))],
      notified: result.notified,
    });
  } catch (err) {
    return failure(err);
  }
}

/** Keeps the events off the site with one reason for all, noted on each; organizers with alerts on are told. */
export async function rejectEventsAction(input: { ids: string[]; reason: string }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z
    .object({ ids: idsSchema, reason: z.string().trim().min(1, "Pick a reason.").max(300, "Keep the note under 300 characters.") })
    .safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const decisionId = newDecisionId();
  try {
    const result = await setEventStatuses(parsed.data.ids, "REJECTED", session.user.id, {
      decisionId,
      decisionKey: DECISION_KEY,
      reason: parsed.data.reason,
    });
    revalidateAdmin();
    return outcome(decisionId, {
      changed: result.changed,
      already: result.alreadyThere,
      failed: result.missing.map((id) => ({ id, reason: "It was archived or removed." })),
      notified: result.notified,
    });
  } catch (err) {
    return failure(err);
  }
}

/** Takes the events out of every list. Restorable. */
export async function archiveEventsAction(input: { ids: string[] }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const decisionId = newDecisionId();
  try {
    const result = await archiveEvents(parsed.data.ids, session.user.id, { decisionId, decisionKey: DECISION_KEY });
    revalidateAdmin();
    return outcome(decisionId, { changed: result.archived, already: result.missing });
  } catch (err) {
    return failure(err);
  }
}

export async function restoreEventsAction(input: { ids: string[] }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const decisionId = newDecisionId();
  try {
    const result = await restoreEvents(parsed.data.ids, session.user.id, { decisionId, decisionKey: DECISION_KEY });
    revalidateAdmin();
    const restored = new Set(result.restored);
    return outcome(decisionId, {
      changed: result.restored,
      already: parsed.data.ids.filter((id) => !restored.has(id)),
    });
  } catch (err) {
    return failure(err);
  }
}

/**
 * Applies one field change to each event through updateEventFields, under one decision id.
 * `changesFor` returns null for an event already as asked. An event that cannot take the change,
 * or fails to save, is reported and the rest still change, so the ones saved can be undone.
 */
async function updateEach(
  ids: string[],
  changesFor: (id: string) => EventFieldChanges | null,
  actorId: string
): Promise<BulkOutcome> {
  const decisionId = newDecisionId();
  const changed: string[] = [];
  const already: string[] = [];
  const failed: BulkFailure[] = [];
  for (const id of ids) {
    const changes = changesFor(id);
    if (!changes) {
      already.push(id);
      continue;
    }
    try {
      await updateEventFields(id, changes, actorId, { decisionId, decisionKey: DECISION_KEY });
      changed.push(id);
    } catch (err) {
      if (err instanceof EventMutationError) {
        failed.push({ id, reason: err.message });
      } else {
        console.error("Bulk event change failed", id, err);
        failed.push({ id, reason: "It could not be saved. Try again." });
      }
    }
  }
  revalidateAdmin();
  return outcome(decisionId, { changed, already, failed });
}

async function currentEvents(ids: string[]) {
  return db.event.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, marketId: true, venueId: true, tags: { select: { id: true } } },
  });
}

function missingIds(ids: string[], found: { id: string }[]): BulkFailure[] {
  const present = new Set(found.map((e) => e.id));
  return ids.filter((id) => !present.has(id)).map((id) => ({ id, reason: "It was archived or removed." }));
}

function withMissing(result: BulkOutcome, missing: BulkFailure[]): BulkOutcome {
  return result.ok ? { ...result, failed: [...missing, ...result.failed] } : result;
}

/** Links the events to a market, or takes them out of their market when `marketId` is null. */
export async function linkEventsToMarketAction(input: { ids: string[]; marketId: string | null }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema, marketId: idSchema.nullable() }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { ids, marketId } = parsed.data;
  if (marketId) {
    const market = await db.market.findFirst({ where: { id: marketId, deletedAt: null }, select: { id: true } });
    if (!market) return { ok: false, message: "That market does not exist or is archived." };
  }
  const events = await currentEvents(ids);
  const byId = new Map(events.map((e) => [e.id, e]));
  const result = await updateEach(
    events.map((e) => e.id),
    (id) => (byId.get(id)!.marketId === marketId ? null : { marketId }),
    session.user.id
  );
  return withMissing(result, missingIds(ids, events));
}

/** Moves the events to one place. */
export async function setEventsPlaceAction(input: { ids: string[]; venueId: string }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema, venueId: idSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { ids, venueId } = parsed.data;
  const venue = await db.venue.findFirst({ where: { id: venueId, deletedAt: null }, select: { id: true } });
  if (!venue) return { ok: false, message: "That place does not exist or is archived." };
  const events = await currentEvents(ids);
  const byId = new Map(events.map((e) => [e.id, e]));
  const result = await updateEach(
    events.map((e) => e.id),
    (id) => (byId.get(id)!.venueId === venueId ? null : { venueId }),
    session.user.id
  );
  return withMissing(result, missingIds(ids, events));
}

/** Adds one tag to each event, keeping the tags it has. */
export async function addTagToEventsAction(input: { ids: string[]; tagId: string }): Promise<BulkOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ ids: idsSchema, tagId: idSchema }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { ids, tagId } = parsed.data;
  const tag = await db.tag.findUnique({ where: { id: tagId }, select: { id: true } });
  if (!tag) return { ok: false, message: "That tag does not exist." };
  const events = await currentEvents(ids);
  const byId = new Map(events.map((e) => [e.id, e]));
  const result = await updateEach(
    events.map((e) => e.id),
    (id) => {
      const current = byId.get(id)!.tags.map((t) => t.id);
      return current.includes(tagId) ? null : { tagIds: [...current, tagId] };
    },
    session.user.id
  );
  return withMissing(result, missingIds(ids, events));
}

/** Reverses one bulk action, leaving alone any event changed since. */
export async function undoEventsAction(input: { decisionId: string }): Promise<UndoOutcome> {
  const session = await requireAdminAction();
  const parsed = z.object({ decisionId: z.string().trim().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "There is nothing to undo." };
  const result = await undoDecision(parsed.data.decisionId, session.user.id);
  revalidateAdmin();
  return { ok: result.ok, message: result.message };
}

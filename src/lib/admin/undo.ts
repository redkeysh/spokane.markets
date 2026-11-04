import { randomUUID } from "node:crypto";
import { Prisma } from "../../../prisma/generated/prisma/client";
import { db } from "@/lib/db";
import { parseDateOnlyToUTCNoon } from "@/lib/utils";
import { revalidateAdmin } from "./revalidate";
import { eventSlugProblem, lockEventForSlugChange, recordEventSlugChange } from "@/lib/events/slug";
import { DETAIL_COLUMNS } from "@/lib/events/mutations";

/** A new id that groups the audit entries of one decision. */
export function newDecisionId(): string {
  return `d_${randomUUID()}`;
}

export type AuditRow = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type Meta = {
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  details?: { decisionId?: string; undoOf?: string; at?: string; title?: string; notified?: string[] };
  moved?: { events?: { id: string; fromVenueId: string }[]; markets?: { id: string; fromVenueId: string }[] };
  mergedIds?: string[];
};

export function metaOf(entry: Pick<AuditRow, "metadata">): Meta {
  const m = entry.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as unknown as Meta) : {};
}

export function decisionIdOf(entry: Pick<AuditRow, "metadata">): string | null {
  return metaOf(entry).details?.decisionId ?? null;
}

/**
 * How far a row's updatedAt may pass its audit entry's time and still count as
 * unchanged: the entry is written just after the row, sometimes by another
 * clock (the database's).
 */
const SAME_WRITE_MS = 2000;

/** Actions undoDecision can reverse, by target type. */
const UNDOABLE: Record<string, Set<string>> = {
  EVENT: new Set(["UPDATE_EVENT", "SOFT_DELETE_EVENT", "RESTORE_EVENT", "CREATE_EVENT"]),
  SUBMISSION: new Set(["UPDATE_SUBMISSION", "UPDATE_SUBMISSION_STATUS"]),
  MARKET: new Set(["CREATE_MARKET"]),
  ADMIN_MEMO: new Set(["SET_ADMIN_MEMO"]),
  VENUE: new Set(["MERGE_VENUES", "UPDATE_VENUE", "SOFT_DELETE_VENUE", "RESTORE_VENUE"]),
  NEIGHBORHOOD: new Set(["CREATE_NEIGHBORHOOD", "UPDATE_NEIGHBORHOOD"]),
};

export function isUndoable(entry: AuditRow): boolean {
  if (!entry.targetType || !entry.targetId || !UNDOABLE[entry.targetType]?.has(entry.action)) return false;
  if (entry.action === "MERGE_VENUES") return !!metaOf(entry).moved;
  return true;
}

function targetKey(entry: Pick<AuditRow, "targetType" | "targetId">) {
  return `${entry.targetType}:${entry.targetId}`;
}

/** The latest moment, per target, that the decision itself wrote the row. */
export function decisionTimes(entries: AuditRow[]): Map<string, number> {
  const times = new Map<string, number>();
  for (const entry of entries) {
    const at = metaOf(entry).details?.at;
    const t = Math.max(entry.createdAt.getTime(), at ? Date.parse(at) : 0);
    const key = targetKey(entry);
    times.set(key, Math.max(times.get(key) ?? 0, t));
  }
  return times;
}

/** `until` is set for memos only. */
type CurrentRow = { updatedAt: Date; title: string | null; until?: Date | null };
type CurrentRows = Map<string, CurrentRow | null>;

/** Current state of every row the entries touch: one query per table. */
export async function currentRows(entries: AuditRow[]): Promise<CurrentRows> {
  const ids = (type: string) => [...new Set(entries.filter((e) => e.targetType === type && e.targetId).map((e) => e.targetId!))];
  const createdEvents = entries
    .filter((e) => e.action === "UPDATE_SUBMISSION_STATUS")
    .map((e) => metaOf(e).newValue?.createdEventId)
    .filter((id): id is string => typeof id === "string");
  const eventIds = [...new Set([...ids("EVENT"), ...createdEvents])];
  const [events, submissions, markets, venues, memos, neighborhoods] = await Promise.all([
    eventIds.length ? db.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, updatedAt: true, title: true } }) : [],
    ids("SUBMISSION").length
      ? db.submission.findMany({ where: { id: { in: ids("SUBMISSION") } }, select: { id: true, updatedAt: true, eventTitle: true } })
      : [],
    ids("MARKET").length ? db.market.findMany({ where: { id: { in: ids("MARKET") } }, select: { id: true, updatedAt: true, name: true } }) : [],
    ids("VENUE").length ? db.venue.findMany({ where: { id: { in: ids("VENUE") } }, select: { id: true, updatedAt: true, name: true } }) : [],
    ids("ADMIN_MEMO").length
      ? db.adminMemo.findMany({ where: { id: { in: ids("ADMIN_MEMO") } }, select: { id: true, createdAt: true, until: true } })
      : [],
    ids("NEIGHBORHOOD").length
      ? db.neighborhood.findMany({ where: { id: { in: ids("NEIGHBORHOOD") } }, select: { id: true, updatedAt: true, label: true } })
      : [],
  ]);
  const rows: CurrentRows = new Map();
  for (const e of events) rows.set(`EVENT:${e.id}`, { updatedAt: e.updatedAt, title: e.title });
  for (const s of submissions) rows.set(`SUBMISSION:${s.id}`, { updatedAt: s.updatedAt, title: s.eventTitle });
  for (const m of markets) rows.set(`MARKET:${m.id}`, { updatedAt: m.updatedAt, title: m.name });
  for (const v of venues) rows.set(`VENUE:${v.id}`, { updatedAt: v.updatedAt, title: v.name });
  for (const m of memos) rows.set(`ADMIN_MEMO:${m.id}`, { updatedAt: m.createdAt, title: null, until: m.until });
  for (const n of neighborhoods) rows.set(`NEIGHBORHOOD:${n.id}`, { updatedAt: n.updatedAt, title: n.label });
  return rows;
}

export type Blocker = { targetType: string; targetId: string; title: string | null; reason: string };

/** The memo's `until` the decision left, in ms (null when it had none). */
function memoUntilAfter(entries: AuditRow[], key: string): number | null {
  const last = entries.filter((e) => targetKey(e) === key).at(-1);
  const until = last ? metaOf(last).newValue?.until : null;
  return typeof until === "string" ? Date.parse(until) : null;
}

/** Why each row of a decision cannot be restored; an empty list means the whole decision can be undone. */
export function undoBlockers(entries: AuditRow[], rows: CurrentRows): Blocker[] {
  const times = decisionTimes(entries);
  const blockers: Blocker[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = targetKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    const title = metaOf(entry).details?.title ?? null;
    const base = { targetType: entry.targetType ?? "", targetId: entry.targetId ?? "", title };
    if (!isUndoable(entry)) {
      blockers.push({ ...base, reason: "This change cannot be undone here." });
      continue;
    }
    const row = rows.get(key);
    if (!row) {
      blockers.push({ ...base, reason: "It no longer exists." });
      continue;
    }
    if (entry.targetType === "ADMIN_MEMO") {
      if ((row.until?.getTime() ?? null) !== memoUntilAfter(entries, key)) {
        blockers.push({ ...base, reason: "It changed after this decision." });
      }
      continue;
    }
    if (row.updatedAt.getTime() > (times.get(key) ?? 0) + SAME_WRITE_MS) {
      blockers.push({ ...base, title: row.title ?? title, reason: "It changed after this decision." });
    }
    const created = metaOf(entry).newValue?.createdEventId;
    if (entry.action === "UPDATE_SUBMISSION_STATUS" && typeof created === "string") {
      const event = rows.get(`EVENT:${created}`);
      if (event && event.updatedAt.getTime() > (times.get(key) ?? 0) + SAME_WRITE_MS) {
        blockers.push({ targetType: "EVENT", targetId: created, title: event.title, reason: "Its event changed after it was published." });
      }
    }
  }
  return blockers;
}

/** Audit entries of decisions, and the ids among them already undone. */
export async function loadDecisions(decisionIds: string[]): Promise<{ entries: Map<string, AuditRow[]>; undone: Set<string> }> {
  const entries = new Map<string, AuditRow[]>();
  if (decisionIds.length === 0) return { entries, undone: new Set() };
  const [rows, undoRows] = await Promise.all([
    db.auditLog.findMany({
      where: { OR: decisionIds.map((id) => ({ metadata: { path: ["details", "decisionId"], equals: id } })) },
      orderBy: { createdAt: "asc" },
      select: { id: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true },
    }),
    db.auditLog.findMany({
      where: { OR: decisionIds.map((id) => ({ metadata: { path: ["details", "undoOf"], equals: id } })) },
      select: { metadata: true },
    }),
  ]);
  for (const row of rows) {
    const id = decisionIdOf(row);
    if (id) entries.set(id, [...(entries.get(id) ?? []), row]);
  }
  const undone = new Set(undoRows.map((r) => metaOf(r).details?.undoOf).filter((id): id is string => !!id));
  return { entries, undone };
}

/** Whether each decision can still be undone (not undone yet, every row unchanged since). */
export async function undoability(decisionIds: string[]): Promise<Map<string, boolean>> {
  const { entries, undone } = await loadDecisions(decisionIds);
  const all = [...entries.values()].flat();
  const rows = await currentRows(all);
  return new Map(decisionIds.map((id) => [id, !undone.has(id) && entries.has(id) && undoBlockers(entries.get(id)!, rows).length === 0]));
}

const EVENT_SCALARS = new Set([
  "title",
  "slug",
  "description",
  "status",
  "venueId",
  "marketId",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "imageUrl",
  "showImageInList",
  "imageFocalX",
  "imageFocalY",
  "complianceNotes",
  "complianceFlagged",
  "duplicateOfId",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
  ...DETAIL_COLUMNS.filter((key) => key !== "vendorApplicationDeadline"),
]);
const EVENT_DATES = new Set(["startDate", "endDate", "deletedAt", "vendorApplicationDeadline"]);

/** The values the rows had before the decision: for each field, the oldest previousValue wins. */
function valuesBefore(entries: AuditRow[]): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  for (const entry of entries) {
    for (const [key, value] of Object.entries(metaOf(entry).previousValue ?? {})) {
      if (!(key in before)) before[key] = value;
    }
  }
  return before;
}

type Tx = Prisma.TransactionClient;
type ScheduleDayJson = { date: string; startTime: string; endTime: string; allDay: boolean };

/**
 * A row changed between the undo's check and its write, or the restored values are no longer
 * allowed; the whole undo rolls back. `reason` replaces the generic message when given.
 */
class UndoConflict extends Error {
  constructor(
    readonly key: string,
    readonly reason?: string
  ) {
    super(reason ?? `${key} changed during the undo`);
  }
}

/** Throws UndoConflict when a guarded write matched no row. */
function claimed(result: { count: number }, key: string): void {
  if (result.count === 0) throw new UndoConflict(key);
}

async function restoreEvent(tx: Tx, id: string, before: Record<string, unknown>, at: Date, key: string) {
  const restoringSlug = typeof before.slug === "string" ? before.slug : null;
  const current = restoringSlug ? await lockEventForSlugChange(tx, id) : null;
  if (restoringSlug && current && current.slug !== restoringSlug) {
    const problem = await eventSlugProblem(id, restoringSlug, { client: tx });
    if (problem) throw new UndoConflict(key, `the old web address is no longer free. ${problem}`);
  }
  const data: Prisma.EventUncheckedUpdateInput = { updatedAt: at };
  for (const [key, value] of Object.entries(before)) {
    if (EVENT_SCALARS.has(key)) (data as Record<string, unknown>)[key] = value;
    else if (EVENT_DATES.has(key)) (data as Record<string, unknown>)[key] = typeof value === "string" ? new Date(value) : null;
  }
  if (Array.isArray(before.tagIds)) data.tags = { set: (before.tagIds as string[]).map((tagId) => ({ id: tagId })) };
  if (Array.isArray(before.featureIds)) data.features = { set: (before.featureIds as string[]).map((featureId) => ({ id: featureId })) };
  if (Array.isArray(before.scheduleDays)) {
    await tx.eventScheduleDay.deleteMany({ where: { eventId: id } });
    const days = before.scheduleDays as ScheduleDayJson[];
    if (days.length > 0) {
      await tx.eventScheduleDay.createMany({
        data: days.map((d) => ({ eventId: id, date: parseDateOnlyToUTCNoon(d.date), startTime: d.startTime, endTime: d.endTime, allDay: d.allDay })),
      });
    }
  }
  await tx.event.update({ where: { id }, data });
  if (restoringSlug && current) {
    await recordEventSlugChange(tx, id, current.slug, restoringSlug, { previousStatus: current.status });
  }
}

/**
 * Restores one target inside the undo's transaction. Each row is first
 * claimed with a write that only matches it while it is unchanged since the
 * decision (updatedAt at most `limit`, or a memo's `until` as the decision
 * left it); a claim that matches nothing throws UndoConflict.
 */
async function restoreTarget(tx: Tx, entries: AuditRow[], at: Date, limit: Date): Promise<string[]> {
  const first = entries[0];
  const id = first.targetId!;
  const key = targetKey(first);
  const before = valuesBefore(entries);
  const unchanged = { updatedAt: { lte: limit } };
  const touchedEvents: string[] = [];
  switch (first.targetType) {
    case "EVENT":
      if (entries.some((e) => e.action === "CREATE_EVENT")) {
        // An event the decision created is archived.
        claimed(await tx.event.updateMany({ where: { id, ...unchanged }, data: { deletedAt: at, updatedAt: at } }), key);
        touchedEvents.push(id);
        break;
      }
      claimed(await tx.event.updateMany({ where: { id, ...unchanged }, data: { updatedAt: at } }), key);
      await restoreEvent(tx, id, before, at, key);
      touchedEvents.push(id);
      break;
    case "SUBMISSION": {
      claimed(await tx.submission.updateMany({ where: { id, ...unchanged }, data: { updatedAt: at } }), key);
      const data: Prisma.SubmissionUpdateInput = {};
      for (const [field, value] of Object.entries(before)) {
        if (field !== "status") (data as Record<string, unknown>)[field] = field === "scheduleDays" && value === null ? Prisma.DbNull : value;
      }
      const statusEntry = entries.find((e) => e.action === "UPDATE_SUBMISSION_STATUS");
      if (statusEntry) {
        data.status = "PENDING";
        data.reviewer = { disconnect: true };
        const created = metaOf(statusEntry).newValue?.createdEventId;
        if (typeof created === "string") {
          data.createdEvent = { disconnect: true };
          claimed(
            await tx.event.updateMany({ where: { id: created, ...unchanged }, data: { deletedAt: at, updatedAt: at } }),
            `EVENT:${created}`
          );
          touchedEvents.push(created);
        }
      }
      await tx.submission.update({ where: { id }, data });
      break;
    }
    case "MARKET":
      claimed(await tx.market.updateMany({ where: { id, ...unchanged }, data: { deletedAt: at } }), key);
      break;
    case "ADMIN_MEMO": {
      const untilAfter = memoUntilAfter(entries, key);
      const where = { id, until: untilAfter === null ? null : new Date(untilAfter) };
      const previous = metaOf(first).previousValue;
      if (previous && typeof previous.until !== "undefined") {
        const until = previous.until ? new Date(String(previous.until)) : null;
        claimed(await tx.adminMemo.updateMany({ where, data: { until } }), key);
      } else {
        claimed(await tx.adminMemo.deleteMany({ where }), key);
      }
      break;
    }
    case "VENUE": {
      claimed(await tx.venue.updateMany({ where: { id, ...unchanged }, data: { updatedAt: at } }), key);
      const meta = metaOf(first);
      for (const moved of meta.moved?.events ?? []) {
        const back = await tx.event.updateMany({ where: { id: moved.id, venueId: id }, data: { venueId: moved.fromVenueId, updatedAt: at } });
        if (back.count > 0) touchedEvents.push(moved.id);
      }
      for (const moved of meta.moved?.markets ?? []) {
        await tx.market.updateMany({ where: { id: moved.id, venueId: id }, data: { venueId: moved.fromVenueId } });
      }
      if (meta.mergedIds?.length) await tx.venue.updateMany({ where: { id: { in: meta.mergedIds } }, data: { deletedAt: null } });
      const keep: Prisma.VenueUpdateInput = {};
      for (const [field, value] of Object.entries(before)) (keep as Record<string, unknown>)[field] = value;
      if (Object.keys(keep).length > 0) await tx.venue.update({ where: { id }, data: keep });
      break;
    }
    case "NEIGHBORHOOD": {
      // A neighborhood the decision created had no previous value; undoing it turns it off.
      const isActive = typeof before.isActive === "boolean" ? before.isActive : false;
      claimed(await tx.neighborhood.updateMany({ where: { id, ...unchanged }, data: { isActive } }), key);
      break;
    }
  }
  return touchedEvents;
}

export type UndoResult = {
  ok: boolean;
  /** Rows put back as they were before the decision. */
  restored: { targetType: string; targetId: string; title: string | null }[];
  /** Rows left as they are, and why. */
  refused: Blocker[];
  /** People the decision already told; an undo cannot unsend that. */
  alreadyTold: string[];
  message: string;
};

/**
 * Reverses a decision from its audit entries: restores previous statuses,
 * archive state, duplicateOfId and field values, a submission and the event
 * its approval created, a created market, a memo, and (when the merge entry
 * records them) the events and markets a place merge moved. A row changed
 * after the decision is left alone and listed in `refused`. Writes one audit
 * entry per restored row, with details.undoOf. The restore is one
 * transaction: when a row changes while it runs, nothing is restored.
 */
export async function undoDecision(decisionId: string, actorId: string): Promise<UndoResult> {
  const { entries, undone } = await loadDecisions([decisionId]);
  const list = entries.get(decisionId) ?? [];
  const empty = { restored: [], refused: [], alreadyTold: [] };
  if (list.length === 0) return { ok: false, ...empty, message: "There is nothing to undo for this decision." };
  if (undone.has(decisionId)) return { ok: false, ...empty, message: "This decision was already undone." };

  const rows = await currentRows(list);
  const refused = undoBlockers(list, rows);
  const blocked = new Set(refused.map((b) => `${b.targetType}:${b.targetId}`));
  const byTarget = new Map<string, AuditRow[]>();
  for (const entry of list) {
    const key = targetKey(entry);
    if (blocked.has(key)) continue;
    const created = metaOf(entry).newValue?.createdEventId;
    if (typeof created === "string" && blocked.has(`EVENT:${created}`)) continue;
    byTarget.set(key, [...(byTarget.get(key) ?? []), entry]);
  }

  const times = decisionTimes(list);
  const titleOf = (key: string, entry: AuditRow) => rows.get(key)?.title ?? metaOf(entry).details?.title ?? null;
  const alreadyTold = [...new Set(list.flatMap((e) => metaOf(e).details?.notified ?? []))];
  const at = new Date();
  const restored: UndoResult["restored"] = [];
  const touchedEvents: string[] = [];
  try {
    await db.$transaction(async (tx) => {
      for (const [key, targetEntries] of byTarget) {
        const limit = new Date((times.get(key) ?? 0) + SAME_WRITE_MS);
        touchedEvents.push(...(await restoreTarget(tx, targetEntries, at, limit)));
        const first = targetEntries[0];
        const title = titleOf(key, first);
        restored.push({ targetType: first.targetType!, targetId: first.targetId!, title });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "UNDO_DECISION",
            targetType: first.targetType,
            targetId: first.targetId,
            metadata: {
              previousValue: Object.fromEntries(targetEntries.flatMap((e) => Object.entries(metaOf(e).newValue ?? {}))),
              newValue: valuesBefore(targetEntries),
              details: { undoOf: decisionId, at: at.toISOString(), ...(title ? { title } : {}) },
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
  } catch (err) {
    if (!(err instanceof UndoConflict)) throw err;
    const entry = list.find((e) => targetKey(e) === err.key);
    const title = rows.get(err.key)?.title ?? (entry ? metaOf(entry).details?.title : null) ?? null;
    return {
      ok: false,
      restored: [],
      refused,
      alreadyTold: [],
      message: err.reason
        ? `Nothing was restored: ${err.reason}`
        : `Nothing was restored: ${title ?? "one of its rows"} changed while undoing. Try again.`,
    };
  }

  const slugs = touchedEvents.length
    ? (await db.event.findMany({ where: { id: { in: touchedEvents } }, select: { slug: true } })).map((e) => e.slug)
    : [];
  revalidateAdmin({ eventSlugs: slugs });

  const parts = [
    restored.length ? `Restored ${restored.length === 1 ? (restored[0].title ?? "1 row") : `${restored.length}`}.` : "Nothing was restored.",
    refused.length
      ? `Left as ${refused.length === 1 ? "it is" : "they are"}: ${refused.map((r) => `${r.title ?? r.targetId} (${r.reason.replace(/\.$/, "").toLowerCase()})`).join(", ")}.`
      : "",
    alreadyTold.length ? `${alreadyTold.join(" and ")} ${alreadyTold.length === 1 ? "was" : "were"} already told.` : "",
  ].filter(Boolean);
  return { ok: restored.length > 0, restored, refused, alreadyTold, message: parts.join(" ") };
}

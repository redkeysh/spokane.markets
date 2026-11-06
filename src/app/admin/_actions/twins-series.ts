"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { dateColumnToIso, pacificDate } from "@/lib/admin/format";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import { EventMutationError, archiveEvents, setEventStatuses, updateEventFields, type EventFieldChanges } from "@/lib/events/mutations";
import { findSeries } from "@/lib/events/series-rules";
import { eventSlugProblem } from "@/lib/events/slug";
import { makeMarketFromEvents, marketDraftFromEvents } from "@/lib/markets/make-from-events";
import { loadPlaceGroups } from "@/lib/markets/queries";
import { mergeVenues } from "@/lib/venues/merge";
import { addressFixes, type AddressFix } from "@/components/admin/todo/kinds/series-model";
import type { TodoActionResult } from "@/components/admin/todo/types";

const id = z.string().trim().min(1).max(64);
const ids = z.array(id).min(1).max(500);
const decisionKey = z.string().trim().min(1).max(4000);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 10:00.");
const link = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Links start with https://.");

const picture = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .refine((v) => !v || v.startsWith("/uploads/") || /^https?:\/\/\S+$/i.test(v), "A picture link starts with https://.");

const fixesInput = z.strictObject({
  decisionKey,
  eventIds: ids,
  fixAddresses: z.boolean(),
  imageUrl: picture.optional(),
});
const linkInput = z.strictObject({ decisionKey, eventIds: ids, marketId: id });
const makeInput = z.strictObject({ decisionKey, eventIds: ids, name: z.string().trim().min(1).max(200).optional() });
const mergeInput = z
  .strictObject({ decisionKey, keepId: id, mergeIds: ids })
  .refine((v) => !v.mergeIds.includes(v.keepId), "The place to keep cannot also be merged away.");
const detailsInput = z.strictObject({ eventIds: ids });

const scheduleDay = z
  .strictObject({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), allDay: z.boolean(), startTime: clock.optional(), endTime: clock.optional() })
  .refine((d) => d.allDay || (!!d.startTime && !!d.endTime && d.endTime > d.startTime), "A day closes before it opens.");

const combinedChanges = z.strictObject({
  title: z.string().trim().min(1, "The title cannot be empty.").max(200).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  scheduleDays: z.array(scheduleDay).min(1).max(366).optional(),
  venueId: id.optional(),
  tagIds: z.array(id).max(50).optional(),
  featureIds: z.array(id).max(50).optional(),
  websiteUrl: link.optional(),
  facebookUrl: link.optional(),
  instagramUrl: link.optional(),
  imageUrl: picture.optional(),
});
const combineInput = z
  .strictObject({ decisionKey, keepId: id, archiveIds: ids, changes: combinedChanges, publish: z.boolean() })
  .refine((v) => !v.archiveIds.includes(v.keepId), "The event to keep cannot also be archived.")
  .refine((v) => new Set(v.archiveIds).size === v.archiveIds.length, "Each copy can be archived once.");

type Failure = { ok: false; error: string };
type Ok = Extract<TodoActionResult, { ok: true }>;

function parse<S extends z.ZodType>(schema: S, input: unknown): { data: z.output<S> } | Failure {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "That request was not understood." };
}

function failure(err: unknown): Failure {
  if (err instanceof EventMutationError) return { ok: false, error: err.message };
  if (err instanceof Error && err.message === "Unauthorized") return { ok: false, error: "Sign in as an admin to do this." };
  console.error("[twins-series] action failed:", err);
  return { ok: false, error: "Something went wrong. Try again." };
}

const NOTHING = { changed: [], alreadyThere: [], refused: [], notified: [] };

/** Undoes the steps of a decision that already ran, then passes the error on. */
async function rollBack(decisionId: string, actor: string, wrote: boolean, err: unknown): Promise<never> {
  if (wrote) {
    try {
      await undoDecision(decisionId, actor);
    } catch (undoErr) {
      console.error("[twins-series] undoing the first steps failed:", undoErr);
    }
    revalidateAdmin();
  }
  throw err;
}

type SeriesRowData = { id: string; title: string; slug: string; status: string; startDate: Date; imageUrl: string | null };

async function seriesRows(eventIds: string[]): Promise<SeriesRowData[]> {
  return db.event.findMany({
    where: { id: { in: [...new Set(eventIds)] }, deletedAt: null },
    select: { id: true, title: true, slug: true, status: true, startDate: true, imageUrl: true },
    orderBy: { startDate: "asc" },
  });
}

/**
 * The address each date's title gives, made free: when another event (or a redirect) holds it,
 * or an earlier date of the same plan (`planned`) takes it, "-2", "-3" and so on are tried.
 * `problem` says why no free address was found, else null.
 */
async function freeAddress(fix: AddressFix, planned: ReadonlySet<string>): Promise<{ to: string; problem: string | null }> {
  for (let n = 1; n <= 9; n += 1) {
    const to = n === 1 ? fix.to : `${fix.to}-${n}`;
    if (planned.has(to)) continue;
    const problem = await eventSlugProblem(fix.eventId, to);
    if (!problem) return { to, problem: null };
    if (n === 1 && !/already uses|redirects there/.test(problem)) return { to, problem };
  }
  return { to: fix.to, problem: `Another event already uses /events/${fix.to}.` };
}

async function addressPlan(rows: SeriesRowData[]): Promise<(AddressFix & { problem: string | null })[]> {
  const fixes = addressFixes(rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, status: r.status, date: pacificDate(r.startDate) })));
  const plan: (AddressFix & { problem: string | null })[] = [];
  const planned = new Set<string>();
  for (const fix of fixes) {
    const free = await freeAddress(fix, planned);
    if (!free.problem) planned.add(free.to);
    plan.push({ ...fix, ...free });
  }
  return plan;
}

/** Set once the first write of a decision has gone through, so a later failure knows to undo it. */
type Progress = { wrote: boolean };

/**
 * The held fixes of a series, written to every date as part of decision `decisionId`: the web
 * addresses their titles give (old public addresses keep redirecting) and one picture.
 */
async function writeFixes(
  rows: SeriesRowData[],
  input: { fixAddresses: boolean; imageUrl?: string | null },
  actor: string,
  ref: { decisionId: string; decisionKey: string },
  progress: Progress
): Promise<void> {
  const changes = new Map<string, EventFieldChanges>();
  if (input.fixAddresses) {
    for (const fix of await addressPlan(rows)) {
      if (fix.problem) throw new EventMutationError(`${fix.title}: ${fix.problem}`);
      changes.set(fix.eventId, { slug: fix.to });
    }
  }
  if (input.imageUrl !== undefined) {
    for (const row of rows) {
      if ((row.imageUrl ?? null) === (input.imageUrl || null)) continue;
      changes.set(row.id, { ...changes.get(row.id), imageUrl: input.imageUrl || null });
    }
  }
  for (const [eventId, change] of changes) {
    await updateEventFields(eventId, change, actor, ref);
    progress.wrote = true;
  }
}

export type SeriesDetails = {
  /** The market the dates belong to. */
  market: { id: string; name: string; verified: boolean; homeName: string | null } | null;
  /** A market without these dates that looks like theirs (same place, similar name). */
  suggestedMarket: { id: string; name: string } | null;
  /** What "Make a market" would create. */
  draft: { name: string; venueName: string; typicalSchedule: string | null } | null;
  /** The dates' place when it is listed more than once, and the record a merge keeps. */
  place: { id: string; name: string; keep: { id: string; name: string; marketHome: boolean }; mergeIds: string[]; others: string[] } | null;
  /** Dates whose web address names another event, with the address their title gives. */
  addresses: (AddressFix & { problem: string | null })[];
};

/** What the series pane needs beyond the To do data: market, place duplicates and address fixes. Reads only. */
export async function seriesDecisionDetails(input: z.input<typeof detailsInput>): Promise<SeriesDetails | null> {
  await requireAdminAction();
  const parsed = detailsInput.safeParse(input);
  if (!parsed.success) return null;
  const events = await db.event.findMany({
    where: { id: { in: parsed.data.eventIds }, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      startDate: true,
      endDate: true,
      imageUrl: true,
      venueId: true,
      marketId: true,
      venue: { select: { name: true } },
      scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true } },
    },
    orderBy: { startDate: "asc" },
  });
  if (events.length === 0) return null;

  const [groups, markets, listings] = await Promise.all([
    loadPlaceGroups(),
    db.market.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, venueId: true, verificationStatus: true, venue: { select: { name: true } } },
    }),
    db.event.findMany({ where: { deletedAt: null, marketId: { not: null } }, select: { title: true, venueId: true, marketId: true } }),
  ]);
  const marketId = events.find((e) => e.marketId)?.marketId ?? null;
  const market = marketId ? markets.find((m) => m.id === marketId) : undefined;

  let suggestedMarket: SeriesDetails["suggestedMarket"] = null;
  if (!marketId) {
    const [series] = findSeries(
      events.map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, venueId: e.venueId, marketId: null })),
      groups,
      {
        markets: markets.map((m) => ({
          id: m.id,
          name: m.name,
          venueId: m.venueId,
          listings: listings.filter((l) => l.marketId === m.id).map((l) => ({ title: l.title, venueId: l.venueId })),
        })),
      }
    );
    suggestedMarket = series?.suggestedMarket ?? null;
  }

  const draftSource = events.map((e) => ({
    id: e.id,
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    venueId: e.venueId,
    scheduleDays: e.scheduleDays.map((d) => ({ ...d, date: dateColumnToIso(d.date) })),
  }));
  const draft = marketId ? null : marketDraftFromEvents(draftSource);

  const venueCounts = new Map<string, number>();
  for (const e of events) venueCounts.set(e.venueId, (venueCounts.get(e.venueId) ?? 0) + 1);
  const venueId = [...venueCounts].sort((a, b) => b[1] - a[1])[0][0];
  const groupId = groups.get(venueId);
  let place: SeriesDetails["place"] = null;
  if (groupId) {
    const memberIds = [...groups].filter(([, g]) => g === groupId).map(([v]) => v);
    const members = await db.venue.findMany({
      where: { id: { in: memberIds }, deletedAt: null },
      select: { id: true, name: true, _count: { select: { events: { where: { deletedAt: null } } } } },
    });
    if (members.length > 1) {
      const home = market && members.find((m) => m.id === market.venueId);
      const keep = home ?? [...members].sort((a, b) => b._count.events - a._count.events || a.name.localeCompare(b.name))[0];
      const own = members.find((m) => m.id === venueId);
      place = {
        id: venueId,
        name: own?.name ?? events[0].venue.name,
        keep: { id: keep.id, name: keep.name, marketHome: !!home },
        mergeIds: members.filter((m) => m.id !== keep.id).map((m) => m.id),
        others: members.filter((m) => m.id !== venueId).map((m) => m.name),
      };
    }
  }

  return {
    market: market ? { id: market.id, name: market.name, verified: market.verificationStatus === "VERIFIED", homeName: market.venue?.name ?? null } : null,
    suggestedMarket,
    draft: draft ? { name: draft.name, venueName: events.find((e) => e.venueId === draft.venueId)?.venue.name ?? events[0].venue.name, typicalSchedule: draft.typicalSchedule } : null,
    place,
    addresses: await addressPlan(events),
  };
}

/**
 * Publishes the ticked dates of a series as one decision, after writing the held fixes (web
 * addresses, one picture) to them. When a step fails, the steps before it are undone.
 */
export async function publishSeries(input: z.input<typeof fixesInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(fixesInput, input);
    if ("error" in parsed) return parsed;
    const actor = session.user.id;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const rows = await seriesRows(parsed.data.eventIds);
    if (rows.length === 0) return { ok: false, error: "These dates no longer exist or are archived." };
    const progress: Progress = { wrote: false };
    let status: Awaited<ReturnType<typeof setEventStatuses>>;
    try {
      await writeFixes(rows, parsed.data, actor, ref, progress);
      status = await setEventStatuses(
        rows.map((r) => r.id),
        "PUBLISHED",
        actor,
        ref
      );
    } catch (err) {
      return await rollBack(ref.decisionId, actor, progress.wrote, err);
    }
    revalidateAdmin();
    return {
      ok: true,
      decisionId: progress.wrote || status.changed.length ? ref.decisionId : null,
      changed: status.changed,
      alreadyThere: status.alreadyThere,
      refused: status.refused,
      notified: status.notified,
    };
  } catch (err) {
    return failure(err);
  }
}

/** Writes the held fixes of a series (web addresses, one picture) to every ticked date without publishing them. */
export async function applyToSeriesDates(input: z.input<typeof fixesInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(fixesInput, input);
    if ("error" in parsed) return parsed;
    const actor = session.user.id;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const rows = await seriesRows(parsed.data.eventIds);
    if (rows.length === 0) return { ok: false, error: "These dates no longer exist or are archived." };
    const progress: Progress = { wrote: false };
    try {
      await writeFixes(rows, parsed.data, actor, ref, progress);
    } catch (err) {
      return await rollBack(ref.decisionId, actor, progress.wrote, err);
    }
    revalidateAdmin();
    return { ok: true, decisionId: progress.wrote ? ref.decisionId : null, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** Links the dates to a market, as one decision. */
export async function linkSeriesToMarket(input: z.input<typeof linkInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(linkInput, input);
    if ("error" in parsed) return parsed;
    const actor = session.user.id;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const rows = await db.event.findMany({
      where: { id: { in: parsed.data.eventIds }, deletedAt: null },
      select: { id: true, marketId: true },
    });
    const linked: string[] = [];
    try {
      for (const row of rows) {
        if (row.marketId === parsed.data.marketId) continue;
        await updateEventFields(row.id, { marketId: parsed.data.marketId }, actor, ref);
        linked.push(row.id);
      }
    } catch (err) {
      return await rollBack(ref.decisionId, actor, linked.length > 0, err);
    }
    revalidateAdmin();
    return { ok: true, decisionId: linked.length ? ref.decisionId : null, ...NOTHING, changed: linked };
  } catch (err) {
    return failure(err);
  }
}

/** Makes a market from the dates (name, home place and schedule from them) and links every date to it. */
export async function makeSeriesMarket(input: z.input<typeof makeInput>): Promise<TodoActionResult & { marketId?: string }> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(makeInput, input);
    if ("error" in parsed) return parsed;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const made = await makeMarketFromEvents(parsed.data.eventIds, parsed.data.name ? { name: parsed.data.name } : {}, session.user.id, ref);
    revalidateAdmin();
    return { ok: true, decisionId: ref.decisionId, ...NOTHING, changed: made.linked, marketId: made.marketId };
  } catch (err) {
    return failure(err);
  }
}

/** Merges the places a series' dates are listed under into the one to keep (the market's home when it is one of them). */
export async function mergeSeriesPlace(input: z.input<typeof mergeInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(mergeInput, input);
    if ("error" in parsed) return parsed;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const result = await mergeVenues(parsed.data.keepId, parsed.data.mergeIds, session.user.id, ref);
    if (!result.ok) return { ok: false, error: result.error };
    revalidateAdmin({ eventSlugs: result.eventSlugs, marketSlugs: result.marketSlugs });
    return { ok: true, decisionId: ref.decisionId, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Same event twice, picked field by field: writes the chosen values to the copy to keep, then
 * publishes it (or keeps it as a draft), then archives the others as its duplicates so the next
 * import skips them. When a step fails, the steps before it are undone.
 */
export async function keepCombined(input: z.input<typeof combineInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(combineInput, input);
    if ("error" in parsed) return parsed;
    const { keepId, archiveIds, changes, publish } = parsed.data;
    const actor = session.user.id;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const keep = await db.event.findFirst({ where: { id: keepId, deletedAt: null }, select: { status: true } });
    if (!keep) return { ok: false, error: "The event to keep does not exist or is archived." };
    const [tags, features] = await Promise.all([
      changes.tagIds?.length ? db.tag.count({ where: { id: { in: changes.tagIds } } }) : 0,
      changes.featureIds?.length ? db.feature.count({ where: { id: { in: changes.featureIds } } }) : 0,
    ]);
    if (tags < (changes.tagIds?.length ?? 0) || features < (changes.featureIds?.length ?? 0)) {
      return { ok: false, error: "A chosen tag or feature no longer exists. Reload and choose again." };
    }

    const fields: EventFieldChanges = { ...changes };
    if (!publish && keep.status === "PENDING") fields.status = "DRAFT";
    let wrote = false;
    let status: Pick<Ok, "changed" | "alreadyThere" | "refused" | "notified"> = NOTHING;
    let archived: string[];
    try {
      if (Object.keys(fields).length > 0) {
        await updateEventFields(keepId, fields, actor, ref);
        wrote = true;
      }
      if (publish && keep.status !== "PUBLISHED") {
        status = await setEventStatuses([keepId], "PUBLISHED", actor, ref);
        if (status.refused.length > 0) throw new EventMutationError(`Nothing was changed. ${status.refused[0].reason}`);
        wrote = wrote || status.changed.length > 0;
      }
      archived = (await archiveEvents(archiveIds, actor, { ...ref, duplicateOfId: keepId })).archived;
    } catch (err) {
      return await rollBack(ref.decisionId, actor, wrote, err);
    }
    revalidateAdmin();
    const { changed, alreadyThere, refused, notified } = status;
    return { ok: true, decisionId: ref.decisionId, changed, alreadyThere, refused, notified, archived };
  } catch (err) {
    return failure(err);
  }
}

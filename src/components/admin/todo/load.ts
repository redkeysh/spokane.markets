import { db } from "@/lib/db";
import { buildDecisions, loadDecisionInput } from "@/lib/admin/decisions";
import type { DecisionEvent, DecisionInput, DecisionLane, DecisionsResult } from "@/lib/admin/decisions/types";
import { getDoneToday } from "@/lib/admin/done-today";
import {
  addDays,
  dateColumnToIso,
  formatDay,
  formatDayRange,
  formatTime,
  formatTimeRange,
  formatTimestamp,
  formatWeekday,
  pacificDate,
  pacificTime,
  saturdayOf,
  startOfPacificDay,
} from "@/lib/admin/format";
import { areaOf } from "@/lib/admin/regions";
import { submissionDays } from "@/lib/admin/weekends";
import { eventOrigin, importCohorts } from "@/lib/events/origin";
import {
  eventLocalDates,
  hasEnded,
  hasImporterNote,
  lastLocalDay,
  pictureIsWebPage,
  placeProblems,
  readiness,
  type ScheduleDayRow,
} from "@/lib/events/readiness";
import { findDuplicateGroups, placeMemosOf } from "@/lib/venues/match";
import { findMatchingVenue } from "@/lib/venues/resolve";
import { failedPlaceLine, missingPlaceParts, placeLineOf, uncheckedPlaceLine } from "./place-line";
import type { TodoData, TodoEvent, TodoLane, TodoLink, TodoOptions, TodoPlaceLine, TodoSubmission } from "./types";

/**
 * Submissions whose place is matched against saved places on load. The load never geocodes: a
 * place that matches none is found on the map when its decision opens (checkSubmissionPlace).
 */
const PLACE_LOOKUPS = 25;

export function linkLabel(url: string): string {
  const bare = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  return bare.length > 56 ? `${bare.slice(0, 55)}…` : bare;
}

export function linksOf(row: { websiteUrl: string | null; facebookUrl: string | null; instagramUrl: string | null }): TodoLink[] {
  const links: TodoLink[] = [];
  if (row.websiteUrl?.trim()) links.push({ kind: "website", href: row.websiteUrl.trim(), label: linkLabel(row.websiteUrl) });
  if (row.facebookUrl?.trim()) links.push({ kind: "facebook", href: row.facebookUrl.trim(), label: linkLabel(row.facebookUrl) });
  if (row.instagramUrl?.trim()) links.push({ kind: "instagram", href: row.instagramUrl.trim(), label: linkLabel(row.instagramUrl) });
  return links;
}

function sortedDays(days: ScheduleDayRow[]): ScheduleDayRow[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

function dayHours(day: ScheduleDayRow): string {
  return day.allDay ? "all day" : formatTimeRange(day.startTime, day.endTime);
}

/** "Sat Nov 7, 10:00 am to 4:00 pm" per day; without daily hours, one "as one stretch" line. */
export function whenLines(
  event: { startDate: Date; endDate: Date; scheduleDays: ScheduleDayRow[] },
  now: Date
): string[] {
  if (event.scheduleDays.length > 0) {
    return sortedDays(event.scheduleDays).map((d) => `${formatDay(d.date, now)}, ${dayHours(d)}`);
  }
  const first = pacificDate(event.startDate);
  const last = lastLocalDay(event.startDate, event.endDate);
  const start = pacificTime(event.startDate);
  const end = pacificTime(event.endDate);
  if (first === last) return [`${formatDay(first, now)}, ${formatTimeRange(start, end)}`];
  return [`${formatDay(first, now)} ${formatTime(start)} to ${formatDay(last, now)} ${formatTime(end)}, as one stretch`];
}

/** "Fri 6:00 pm to Sat 4:00 pm", or "Sat 10:00 am to 4:00 pm" for one day. */
export function whenShort(event: { startDate: Date; endDate: Date; scheduleDays: ScheduleDayRow[] }): string {
  if (event.scheduleDays.length > 0) {
    const days = sortedDays(event.scheduleDays);
    const first = days[0];
    const last = days[days.length - 1];
    if (days.length === 1) return `${formatWeekday(first.date)} ${dayHours(first)}`;
    const from = first.allDay ? formatWeekday(first.date) : `${formatWeekday(first.date)} ${formatTime(first.startTime)}`;
    const to = last.allDay ? formatWeekday(last.date) : `${formatWeekday(last.date)} ${formatTime(last.endTime)}`;
    return `${from} to ${to}`;
  }
  const first = pacificDate(event.startDate);
  const last = lastLocalDay(event.startDate, event.endDate);
  const start = pacificTime(event.startDate);
  const end = pacificTime(event.endDate);
  if (first === last) return `${formatWeekday(first)} ${formatTimeRange(start, end)}`;
  return `${formatWeekday(first)} ${formatTime(start)} to ${formatWeekday(last)} ${formatTime(end)}`;
}

/** "Sat 11 am" for the given day, "Sat all day", or the weekday alone when the hours are unknown. */
export function startLabelOf(event: { startDate: Date; scheduleDays: ScheduleDayRow[] }, date: string): string {
  const day = event.scheduleDays.find((d) => d.date === date);
  if (day) return day.allDay ? `${formatWeekday(date)} all day` : `${formatWeekday(date)} ${formatTime(day.startTime, { dense: true })}`;
  if (pacificDate(event.startDate) === date) {
    return `${formatWeekday(date)} ${formatTime(pacificTime(event.startDate), { dense: true })}`;
  }
  return formatWeekday(date);
}

/** The lanes an event's dates fall in, the way laneSummaries buckets them. */
export function lanesOf(dates: string[], saturdays: string[], ended: boolean): DecisionLane[] {
  if (ended) return ["gone"];
  const lastRailDay = addDays(saturdays[saturdays.length - 1], 1);
  const lanes = new Set<DecisionLane>();
  for (const date of dates) {
    if (date > lastRailDay) lanes.add("later");
    else lanes.add(`week:${saturdayOf(date)}`);
  }
  return [...lanes];
}

function laneSaturdays(result: DecisionsResult): string[] {
  return result.lanes.map((l) => l.saturday).filter((s): s is string => !!s);
}

async function keptOffByLane(today: string, saturdays: string[]): Promise<Map<DecisionLane, number>> {
  const counts = new Map<DecisionLane, number>();
  if (saturdays.length === 0) return counts;
  const lastRailDay = addDays(saturdays[saturdays.length - 1], 1);
  const rows = await db.event.findMany({
    where: {
      endDate: { gte: startOfPacificDay(today) },
      startDate: { lt: startOfPacificDay(addDays(lastRailDay, 1)) },
      OR: [{ status: { in: ["REJECTED", "CANCELLED"] } }, { deletedAt: { not: null } }],
    },
    select: { startDate: true, endDate: true, scheduleDays: { select: { date: true } } },
  });
  for (const row of rows) {
    const dates = eventLocalDates(
      { startDate: row.startDate, endDate: row.endDate, scheduleDays: row.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date) })) },
      { from: today }
    );
    for (const lane of lanesOf(dates, saturdays, false)) {
      if (lane === "later") continue;
      counts.set(lane, (counts.get(lane) ?? 0) + 1);
    }
  }
  return counts;
}

type SubmissionPlaceRow = {
  id: string;
  venueName: string;
  venueAddress: string;
  venueCity: string | null;
  venueState: string | null;
  venueZip: string | null;
};

/** The place line a submission shows on load, from saved places only. */
async function placeOnLoad(row: SubmissionPlaceRow): Promise<TodoPlaceLine> {
  const missing = missingPlaceParts(row);
  if (missing.length > 0) return placeLineOf({ outcome: "incomplete", note: "", missing });
  try {
    const match = await findMatchingVenue({
      name: row.venueName.trim(),
      address: row.venueAddress.trim(),
      city: row.venueCity!.trim(),
      state: row.venueState!.trim(),
      zip: row.venueZip!.trim(),
    });
    if (!match) return uncheckedPlaceLine(row);
    if (match.deletedAt) return placeLineOf({ outcome: "archived", venueId: match.id, name: match.name, note: "" });
    return placeLineOf({ outcome: "existing", venueId: match.id, name: match.name, address: match.address });
  } catch (err) {
    console.error(`[todo] place lookup for submission ${row.id} failed:`, err);
    return failedPlaceLine(row);
  }
}

async function loadSubmissions(now: Date): Promise<Record<string, TodoSubmission>> {
  const rows = await db.submission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      eventTitle: true,
      eventDescription: true,
      submitterName: true,
      submitterEmail: true,
      createdAt: true,
      eventDate: true,
      eventTime: true,
      endTime: true,
      allDay: true,
      scheduleDays: true,
      venueName: true,
      venueAddress: true,
      venueCity: true,
      venueState: true,
      venueZip: true,
      tagIds: true,
      featureIds: true,
      imageUrl: true,
      websiteUrl: true,
      facebookUrl: true,
      instagramUrl: true,
      notes: true,
    },
  });
  if (rows.length === 0) return {};
  const tagIds = [...new Set(rows.flatMap((r) => r.tagIds))];
  const featureIds = [...new Set(rows.flatMap((r) => r.featureIds))];
  const emails = [...new Set(rows.map((r) => r.submitterEmail))];
  const [tags, features, accounts, places] = await Promise.all([
    tagIds.length ? db.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, name: true } }) : [],
    featureIds.length ? db.feature.findMany({ where: { id: { in: featureIds } }, select: { id: true, name: true } }) : [],
    db.user.findMany({ where: { email: { in: emails } }, select: { email: true } }),
    Promise.all(rows.map((row, i) => (i < PLACE_LOOKUPS ? placeOnLoad(row) : uncheckedPlaceLine(row)))),
  ]);
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const featureName = new Map(features.map((f) => [f.id, f.name]));
  const hasAccount = new Set(accounts.map((a) => a.email));
  const today = pacificDate(now);

  return Object.fromEntries(
    rows.map((row, i) => {
      const days = submissionDays(row);
      const dates = [...new Set(days.map((d) => d.date))].sort();
      const json = Array.isArray(row.scheduleDays) ? (row.scheduleDays as { date?: unknown; startTime?: unknown; endTime?: unknown; allDay?: unknown }[]) : [];
      const when =
        json.length > 0
          ? json
              .filter((d): d is { date: string; startTime?: unknown; endTime?: unknown; allDay?: unknown } => typeof d?.date === "string")
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((d) =>
                d.allDay === true || typeof d.startTime !== "string" || typeof d.endTime !== "string"
                  ? `${formatDay(d.date, now)}, all day`
                  : `${formatDay(d.date, now)}, ${formatTimeRange(d.startTime, d.endTime)}`
              )
          : [
              row.allDay || !row.eventTime
                ? `${formatDay(row.eventDate, now)}, all day`
                : row.endTime
                  ? `${formatDay(row.eventDate, now)}, ${formatTimeRange(row.eventTime, row.endTime)}`
                  : `${formatDay(row.eventDate, now)}, from ${formatTime(row.eventTime)}`,
            ];
      const submission: TodoSubmission = {
        id: row.id,
        title: row.eventTitle.trim(),
        description: row.eventDescription,
        submitterName: row.submitterName,
        submitterEmail: row.submitterEmail,
        sentAt: formatTimestamp(row.createdAt),
        dates,
        firstDate: dates.find((d) => d >= today) ?? dates[0] ?? row.eventDate,
        when,
        dateRange: dates.length ? formatDayRange(dates[0], dates[dates.length - 1], now) : formatDay(row.eventDate, now),
        venue: {
          name: row.venueName,
          address: row.venueAddress,
          city: row.venueCity ?? "",
          state: row.venueState ?? "",
          zip: row.venueZip ?? "",
        },
        place: places[i],
        tags: row.tagIds.map((id) => tagName.get(id)).filter((n): n is string => !!n),
        features: row.featureIds.map((id) => featureName.get(id)).filter((n): n is string => !!n),
        imageUrl: row.imageUrl,
        pictureIsPage: pictureIsWebPage(row.imageUrl),
        links: linksOf(row),
        notes: row.notes,
        notifies: hasAccount.has(row.submitterEmail) ? row.submitterName : null,
      };
      return [row.id, submission];
    })
  );
}

function toTodoEvent(
  e: DecisionEvent,
  ctx: {
    now: Date;
    today: string;
    duplicateVenueIds: ReadonlySet<string>;
    cohorts: ReturnType<typeof importCohorts>;
    names: Map<
      string,
      {
        tags: { id: string; name: string }[];
        features: { id: string; name: string }[];
        vendorApplicationState: string | null;
        feeModelVendor: string | null;
      }
    >;
  }
): TodoEvent {
  const all = eventLocalDates(e);
  const upcoming = eventLocalDates(e, { from: ctx.today });
  const firstDate = upcoming[0] ?? all[0] ?? pacificDate(e.startDate);
  const ready = readiness(e, { today: ctx.today, duplicateVenueIds: ctx.duplicateVenueIds });
  const origin = eventOrigin(
    { id: e.id, createdAt: e.createdAt, fromSubmission: !!e.submission, submittedByRole: e.submittedBy?.role ?? null },
    ctx.cohorts
  );
  const names = ctx.names.get(e.id);
  return {
    id: e.id,
    title: e.title.trim(),
    slug: e.slug,
    status: e.status,
    dates: all,
    firstDate,
    startLabel: startLabelOf(e, firstDate),
    when: whenLines(e, ctx.now),
    whenShort: whenShort(e),
    dateRange: all.length ? formatDayRange(all[0], all[all.length - 1], ctx.now) : formatDay(firstDate, ctx.now),
    startIso: e.startDate.toISOString(),
    endIso: e.endDate.toISOString(),
    scheduleDays: sortedDays(e.scheduleDays),
    venue: {
      id: e.venue.id,
      name: e.venue.name,
      address: e.venue.address,
      city: e.venue.city,
      state: e.venue.state,
      zip: e.venue.zip,
      neighborhood: e.venue.neighborhood,
      archived: !!e.venue.deletedAt,
    },
    area: areaOf(e.venue.city, e.venue.state),
    description: e.description,
    importerNote: hasImporterNote(e.description),
    imageUrl: e.imageUrl,
    pictureIsPage: pictureIsWebPage(e.imageUrl),
    links: linksOf(e),
    tags: names?.tags ?? [],
    features: names?.features ?? [],
    marketName: e.marketName,
    vendorApplicationState: names?.vendorApplicationState ?? null,
    feeModelVendor: names?.feeModelVendor ?? null,
    origin: origin.label,
    notifies: e.submittedBy?.alertsOn ? e.submittedBy.name : null,
    blocking: ready.blocking.filter((i) => i.flag !== "not-waiting"),
    warnings: ready.warnings,
  };
}

/** Active places with a label that tells same-named ones apart, and every tag and feature. */
async function loadOptions(venues: DecisionInput["venues"]): Promise<TodoOptions> {
  const active = venues.filter((v) => !v.deletedAt).sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));
  const seen = new Map<string, number>();
  for (const v of active) {
    const key = `${v.name.trim().toLowerCase()}|${v.city.trim().toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const places = active.map((v) => {
    const shared = (seen.get(`${v.name.trim().toLowerCase()}|${v.city.trim().toLowerCase()}`) ?? 0) > 1;
    const label = [v.name.trim(), shared ? v.address.trim() : "", v.city.trim()].filter(Boolean).join(", ");
    return { id: v.id, label, problem: placeProblems(v)[0]?.message ?? null };
  });
  const [tags, features] = await Promise.all([
    db.tag.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.feature.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { places, tags, features };
}

/** Everything the To do screen shows, read in a handful of queries and made serializable. */
export async function loadTodoData(actorId: string, now: Date = new Date()): Promise<TodoData> {
  const input = await loadDecisionInput(now);
  const result = buildDecisions(input);
  const today = result.today;
  const saturdays = laneSaturdays(result);
  const ids = input.events.map((e) => e.id);

  const [names, keptOff, submissions, doneToday, options] = await Promise.all([
    ids.length
      ? db.event.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            tags: { select: { id: true, name: true } },
            features: { select: { id: true, name: true } },
            vendorApplicationState: true,
            feeModelVendor: true,
          },
        })
      : [],
    keptOffByLane(today, saturdays),
    loadSubmissions(now),
    getDoneToday(actorId, now),
    loadOptions(input.venues),
  ]);

  const duplicateVenueIds = new Set(findDuplicateGroups(input.venues.filter((v) => !v.deletedAt), placeMemosOf(input.memos)).flat().map((v) => v.id));
  const ctx = {
    now,
    today,
    duplicateVenueIds,
    cohorts: importCohorts(input.importRows ?? input.events),
    names: new Map(
      names.map((n) => [
        n.id,
        { tags: n.tags, features: n.features, vendorApplicationState: n.vendorApplicationState, feeModelVendor: n.feeModelVendor },
      ])
    ),
  };
  const events: Record<string, TodoEvent> = {};
  const liveByLane = new Map<DecisionLane, DecisionEvent[]>();
  for (const e of input.events) {
    events[e.id] = toTodoEvent(e, ctx);
    if (e.status !== "PUBLISHED" || hasEnded(e, today)) continue;
    for (const lane of lanesOf(eventLocalDates(e, { from: today }), saturdays, false)) {
      liveByLane.set(lane, [...(liveByLane.get(lane) ?? []), e]);
    }
  }

  const lanes: TodoLane[] = result.lanes.map((lane) => ({
    ...lane,
    liveEventIds: (liveByLane.get(lane.lane) ?? [])
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.title.localeCompare(b.title))
      .map((e) => e.id),
    keptOff: keptOff.get(lane.lane) ?? 0,
    span: lane.saturday ? formatDayRange(addDays(lane.saturday, -1), addDays(lane.saturday, 1), now) : null,
  }));

  return {
    now: now.toISOString(),
    today,
    decisions: result.decisions,
    snoozed: result.snoozed.map(({ decision, until }) => ({
      decision,
      until: until.toISOString(),
      back: `Back ${formatDay(pacificDate(until), now)}`,
    })),
    lanes,
    events,
    submissions,
    doneToday: doneToday.map((d) => ({
      decisionId: d.decisionId,
      at: d.at.toISOString(),
      time: d.time,
      sentence: d.sentence,
      canUndo: d.canUndo,
      undone: d.undone,
    })),
    options,
  };
}

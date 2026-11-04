import { db } from "@/lib/db";
import { eventOrigin, importCohorts } from "@/lib/events/origin";
import { eventLocalDates, hasEnded, readiness as readinessOf, type Readiness } from "@/lib/events/readiness";
import { findTwins, placeGroupIndex } from "@/lib/events/twins";
import { findDuplicateGroups, placeMemosOf } from "@/lib/venues/match";
import { addDays, dateColumnToIso, formatWeekendSpan, pacificDate, saturdayOf, startOfPacificDay } from "../format";
import { localDayName } from "../local-days";
import { AREAS, areaOf } from "../regions";
import { RAIL_WEEKS, submissionDays } from "../weekends";
import * as application from "./kinds/application";
import * as approvedUnpublished from "./kinds/approved-unpublished";
import * as archivedInUse from "./kinds/archived-in-use";
import * as gone from "./kinds/gone";
import * as looksWrong from "./kinds/looks-wrong";
import * as marketVerification from "./kinds/market-verification";
import * as maybeTwins from "./kinds/maybe-twins";
import * as message from "./kinds/message";
import * as photo from "./kinds/photo";
import * as placeDuplicates from "./kinds/place-duplicates";
import * as ready from "./kinds/ready";
import * as report from "./kinds/report";
import * as review from "./kinds/review";
import * as series from "./kinds/series";
import * as single from "./kinds/single";
import * as spelling from "./kinds/spelling";
import * as submission from "./kinds/submission";
import * as tradeShows from "./kinds/trade-shows";
import * as twins from "./kinds/twins";
import * as unusedPlaces from "./kinds/unused-places";
import * as zipNeighborhood from "./kinds/zip-neighborhood";
import type {
  Decision,
  DecisionContext,
  DecisionEvent,
  DecisionInput,
  DecisionKind,
  DecisionKindDefinition,
  DecisionLane,
  DecisionsResult,
  LaneSummary,
} from "./types";

export type * from "./types";

/**
 * Every decision kind, in the order they run. Event kinds that claim rows
 * run in precedence order (already happened, approved but never published,
 * might not be a market, same event twice, maybe the same, series, ready
 * batch, single), so an event row lands in at most one of them.
 */
export const DECISION_KINDS: DecisionKindDefinition[] = [
  { kind: "submission", claimsEvents: false, find: submission.find },
  { kind: "gone", claimsEvents: true, find: gone.find },
  { kind: "approved-unpublished", claimsEvents: true, find: approvedUnpublished.find },
  { kind: "trade-shows", claimsEvents: true, find: tradeShows.find },
  { kind: "twins", claimsEvents: true, find: twins.find },
  { kind: "maybe-twins", claimsEvents: true, find: maybeTwins.find },
  { kind: "series", claimsEvents: true, find: series.find },
  { kind: "ready", claimsEvents: true, find: ready.find },
  { kind: "single", claimsEvents: true, find: single.find },
  { kind: "looks-wrong", claimsEvents: false, find: looksWrong.find },
  { kind: "place-duplicates", claimsEvents: false, find: placeDuplicates.find },
  { kind: "zip-neighborhood", claimsEvents: false, find: zipNeighborhood.find },
  { kind: "spelling", claimsEvents: false, find: spelling.find },
  { kind: "archived-in-use", claimsEvents: false, find: archivedInUse.find },
  { kind: "unused-places", claimsEvents: false, find: unusedPlaces.find },
  { kind: "review", claimsEvents: false, find: review.find },
  { kind: "photo", claimsEvents: false, find: photo.find },
  { kind: "report", claimsEvents: false, find: report.find },
  { kind: "application", claimsEvents: false, find: application.find },
  { kind: "message", claimsEvents: false, find: message.find },
  { kind: "market-verification", claimsEvents: false, find: marketVerification.find },
];

/** Tie-break order inside a lane when two decisions settle as many rows on the same date. */
const KIND_RANK: Partial<Record<DecisionKind, number>> = {
  ready: 0,
  twins: 1,
  "maybe-twins": 2,
  series: 3,
  "trade-shows": 4,
  gone: 5,
};

const WAITING = new Set(["PENDING", "DRAFT"]);
const LISTED = new Set(["PENDING", "DRAFT", "PUBLISHED"]);

function buildContext(input: DecisionInput): DecisionContext {
  const now = input.now;
  const today = pacificDate(now);
  const saturdays = Array.from({ length: RAIL_WEEKS }, (_, i) => addDays(saturdayOf(today), i * 7));
  const lastRailDay = addDays(saturdays[RAIL_WEEKS - 1], 1);

  const activeVenues = input.venues.filter((v) => !v.deletedAt);
  const groups = findDuplicateGroups(activeVenues, placeMemosOf(input.memos));
  const placeGroups = placeGroupIndex(groups);
  const duplicateVenueIds = new Set(groups.flat().map((v) => v.id));

  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const waiting = input.events.filter((e) => WAITING.has(e.status));
  const readiness = new Map<string, Readiness>(
    input.events.map((e) => [e.id, readinessOf(e, { today, duplicateVenueIds })])
  );
  const notSameEvent = new Set(input.memos.filter((m) => m.kind === "not-same-event").map((m) => m.key));
  const claimed = new Set<string>();

  const dates = new Map<string, string[]>();
  const upcomingDates = (event: DecisionEvent) => {
    let list = dates.get(event.id);
    if (!list) {
      list = eventLocalDates(event, { from: today });
      dates.set(event.id, list);
    }
    return list;
  };
  const ended = (event: DecisionEvent) => hasEnded(event, today);
  const laneOf = (event: DecisionEvent): DecisionLane => {
    const first = upcomingDates(event)[0];
    if (!first || ended(event)) return "gone";
    return first > lastRailDay ? "later" : `week:${saturdayOf(first)}`;
  };

  let twinPairs: ReturnType<typeof findTwins> | null = null;

  const ctx: DecisionContext = {
    now,
    today,
    saturdays,
    input,
    eventById,
    waiting,
    readiness,
    placeGroups,
    duplicateVenueIds,
    notSameEvent,
    claimed,
    twins: () => {
      twinPairs ??= findTwins(
        input.events
          .filter((e) => LISTED.has(e.status) && !ended(e))
          .map((e) => ({ id: e.id, title: e.title, startDate: e.startDate, venueId: e.venue.id })),
        placeGroups,
        notSameEvent
      );
      return twinPairs;
    },
    upcomingDates,
    laneOf,
    ended,
    unclaimedWaiting: () => waiting.filter((e) => !claimed.has(e.id)),
    row: (event) => {
      const r = readiness.get(event.id);
      return {
        type: "event",
        id: event.id,
        title: event.title,
        status: event.status,
        firstDate: upcomingDates(event)[0] ?? pacificDate(event.startDate),
        flags: r ? [...r.blocking, ...r.warnings].map((i) => i.flag).filter((f) => f !== "not-waiting") : [],
      };
    },
    notifies: (events) => {
      const names = new Map<string, string>();
      for (const e of events) {
        if (e.submittedBy?.alertsOn) names.set(e.submittedBy.id, e.submittedBy.name);
      }
      return [...names.values()];
    },
  };
  return ctx;
}

function laneRank(lane: DecisionLane, saturdays: string[]): number {
  if (lane === "public") return 0;
  if (lane.startsWith("week:")) return 1 + saturdays.indexOf(lane.slice(5));
  return { later: 100, gone: 101, places: 102 }[lane as "later" | "gone" | "places"];
}

function sortDecisions(ctx: DecisionContext, decisions: Decision[]): Decision[] {
  const inLane = (d: Decision) => d.settles.filter((id) => {
    const e = ctx.eventById.get(id);
    return e ? ctx.laneOf(e) === d.lane : false;
  }).length;
  const startOf = (d: Decision) => {
    const first = d.rows.find((r) => r.type === "event");
    return first ? (ctx.eventById.get(first.id)?.startDate.getTime() ?? 0) : 0;
  };
  const isGroup = (d: Decision) => d.rows.length > 1;
  return [...decisions].sort(
    (a, b) =>
      laneRank(a.lane, ctx.saturdays) - laneRank(b.lane, ctx.saturdays) ||
      Number(isGroup(b)) - Number(isGroup(a)) ||
      (isGroup(a)
        ? inLane(b) - inLane(a) ||
          (a.firstDate ?? "").localeCompare(b.firstDate ?? "") ||
          (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9)
        : startOf(a) - startOf(b) || (a.firstDate ?? "").localeCompare(b.firstDate ?? "")) ||
      a.title.localeCompare(b.title) ||
      a.key.localeCompare(b.key)
  );
}

function laneLabel(lane: DecisionLane, ctx: DecisionContext, laterYears: Set<string>): string {
  if (lane === "public") return "From the public";
  if (lane === "gone") return "Already happened";
  if (lane === "places") return "Places, no deadline";
  if (lane === "later") return laterYears.size === 1 ? `Later, ${[...laterYears][0]}` : "Later";
  const saturday = lane.slice(5);
  const span = formatWeekendSpan(saturday, ctx.now);
  const index = ctx.saturdays.indexOf(saturday);
  const name = localDayName(saturday);
  if (index === 0) return `This weekend, ${span}`;
  if (index === 1) return `Next weekend, ${span}`;
  return name ? `${span}, ${name}` : span;
}

function laneSummaries(ctx: DecisionContext, decisions: Decision[]): LaneSummary[] {
  const lanes: DecisionLane[] = ["public", ...ctx.saturdays.map((s) => `week:${s}` as const), "later", "gone", "places"];
  const lastRailDay = addDays(ctx.saturdays[RAIL_WEEKS - 1], 1);
  const cohorts = importCohorts(ctx.input.importRows ?? ctx.input.events);
  const stats = new Map(
    lanes.map((lane) => [
      lane,
      {
        waiting: 0,
        live: 0,
        areas: new Map(AREAS.map((a) => [a, { live: 0, total: 0 }])),
        origins: new Map<string, { live: number; total: number }>(),
      },
    ])
  );
  const laterYears = new Set<string>();

  for (const event of ctx.input.events) {
    const live = event.status === "PUBLISHED";
    if (!live && !WAITING.has(event.status)) continue;
    const touched = new Set<DecisionLane>();
    if (ctx.ended(event)) {
      if (!live) touched.add("gone");
    } else {
      for (const date of ctx.upcomingDates(event)) {
        if (date > lastRailDay) {
          touched.add("later");
          if (!live) laterYears.add(date.slice(0, 4));
        } else touched.add(`week:${saturdayOf(date)}`);
      }
    }
    const origin = eventOrigin(
      {
        id: event.id,
        createdAt: event.createdAt,
        fromSubmission: !!event.submission,
        submittedByRole: event.submittedBy?.role ?? null,
      },
      cohorts
    );
    for (const lane of touched) {
      const s = stats.get(lane)!;
      if (live) s.live += 1;
      else s.waiting += 1;
      const area = s.areas.get(areaOf(event.venue.city, event.venue.state))!;
      area.total += 1;
      if (live) area.live += 1;
      const o = s.origins.get(origin.source) ?? { live: 0, total: 0 };
      o.total += 1;
      if (live) o.live += 1;
      s.origins.set(origin.source, o);
    }
  }
  stats.get("public")!.waiting = ctx.input.submissions.length;

  return lanes.map((lane) => {
    const s = stats.get(lane)!;
    const isWeek = lane.startsWith("week:");
    return {
      lane,
      label: laneLabel(lane, ctx, laterYears),
      saturday: isWeek ? lane.slice(5) : null,
      waiting: lane === "places" ? decisions.filter((d) => d.lane === "places").length : s.waiting,
      live: s.live,
      decisions: decisions.filter((d) => d.lane === lane).length,
      areas: isWeek ? [...s.areas].map(([area, v]) => ({ area, ...v })) : [],
      origins: isWeek
        ? [...s.origins]
            .map(([source, v]) => ({ source, ...v }))
            .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source))
        : [],
    };
  });
}

/**
 * Files every waiting row into decisions (pure: no database access). Runs
 * the kinds of `registry` in order, letting event kinds claim their rows,
 * then sets aside decisions snoozed by a "later" memo.
 */
export function buildDecisions(input: DecisionInput, registry: DecisionKindDefinition[] = DECISION_KINDS): DecisionsResult {
  const ctx = buildContext(input);
  const all: Decision[] = [];
  for (const definition of registry) {
    const found = definition.find(ctx);
    if (definition.claimsEvents) {
      for (const decision of found) {
        for (const row of decision.rows) if (row.type === "event") ctx.claimed.add(row.id);
      }
    }
    all.push(...found);
  }

  const snoozedUntil = new Map(
    input.memos
      .filter((m) => m.kind === "later" && m.until && m.until > input.now)
      .map((m) => [m.key, m.until!] as const)
  );
  const sorted = sortDecisions(ctx, all);
  const visible = sorted.filter((d) => !snoozedUntil.has(d.key));
  return {
    today: ctx.today,
    decisions: visible,
    snoozed: sorted.filter((d) => snoozedUntil.has(d.key)).map((decision) => ({ decision, until: snoozedUntil.get(decision.key)! })),
    lanes: laneSummaries(ctx, visible),
  };
}

/** Reads the rows decisions are made from: a handful of queries, no per-row reads. */
export async function loadDecisionInput(now: Date): Promise<DecisionInput> {
  const startOfToday = startOfPacificDay(pacificDate(now));
  const [events, importRows, venues, submissions, memos, neighborhoods] = await Promise.all([
    db.event.findMany({
      where: {
        deletedAt: null,
        OR: [{ status: { in: ["PENDING", "DRAFT"] } }, { status: "PUBLISHED", endDate: { gte: startOfToday } }],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        description: true,
        imageUrl: true,
        websiteUrl: true,
        facebookUrl: true,
        instagramUrl: true,
        marketId: true,
        market: { select: { name: true } },
        venue: {
          select: { id: true, name: true, address: true, city: true, state: true, zip: true, neighborhood: true, deletedAt: true },
        },
        scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true } },
        _count: { select: { tags: true, features: true } },
        submittedBy: {
          select: { id: true, name: true, email: true, role: true, notificationPreference: { select: { organizerAlertsEnabled: true } } },
        },
        submissionFrom: { select: { id: true, status: true } },
      },
    }),
    db.event.findMany({ select: { id: true, createdAt: true } }),
    db.venue.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        lat: true,
        lng: true,
        neighborhood: true,
        deletedAt: true,
        _count: { select: { events: { where: { deletedAt: null } }, markets: { where: { deletedAt: null } } } },
      },
    }),
    db.submission.findMany({
      where: { status: "PENDING" },
      select: {
        id: true,
        eventTitle: true,
        createdAt: true,
        submitterName: true,
        submitterEmail: true,
        eventDate: true,
        eventTime: true,
        allDay: true,
        scheduleDays: true,
        venueName: true,
        venueCity: true,
      },
    }),
    db.adminMemo.findMany({
      where: { kind: { in: ["later", "not-same-event", "not-same-place", "same-place"] } },
      select: { kind: true, key: true, until: true },
    }),
    db.neighborhood.findMany({ select: { slug: true, label: true, isActive: true } }),
  ]);

  // Exact email match: approveSubmissionWithEvent finds the account it notifies the same way.
  const emails = [...new Set(submissions.map((s) => s.submitterEmail))];
  const accounts =
    emails.length === 0
      ? new Set<string>()
      : new Set((await db.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email));

  return {
    now,
    importRows,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      slug: e.slug,
      status: e.status,
      startDate: e.startDate,
      endDate: e.endDate,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      scheduleDays: e.scheduleDays.map((d) => ({ date: dateColumnToIso(d.date), startTime: d.startTime, endTime: d.endTime, allDay: d.allDay })),
      description: e.description,
      imageUrl: e.imageUrl,
      websiteUrl: e.websiteUrl,
      facebookUrl: e.facebookUrl,
      instagramUrl: e.instagramUrl,
      tagCount: e._count.tags,
      featureCount: e._count.features,
      marketId: e.marketId,
      marketName: e.market?.name ?? null,
      venue: e.venue,
      submittedBy: e.submittedBy
        ? {
            id: e.submittedBy.id,
            name: e.submittedBy.name?.trim() || e.submittedBy.email.split("@")[0],
            role: e.submittedBy.role,
            alertsOn: e.submittedBy.notificationPreference?.organizerAlertsEnabled !== false,
          }
        : null,
      submission: e.submissionFrom,
    })),
    submissions: submissions.map((s) => ({
      id: s.id,
      title: s.eventTitle,
      createdAt: s.createdAt,
      submitterName: s.submitterName,
      submitterHasAccount: accounts.has(s.submitterEmail),
      dates: submissionDays(s)
        .map((d) => d.date)
        .sort(),
      venueName: s.venueName,
      venueCity: s.venueCity,
    })),
    venues: venues.map(({ _count, ...v }) => ({ ...v, uses: { events: _count.events, markets: _count.markets } })),
    memos,
    neighborhoods,
  };
}

/** The To do pile: every decision, by lane, for the admin home. */
export async function getDecisions({ now = new Date() }: { now?: Date } = {}): Promise<DecisionsResult> {
  return buildDecisions(await loadDecisionInput(now));
}

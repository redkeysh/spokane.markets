/**
 * Server-side reads for the editor pages: the record, the pickers' choices
 * and the side column's context. Read-only.
 */
import { db } from "@/lib/db";
import type { HistoryListEntry } from "@/components/admin/kit/history-list";
import {
  addDays,
  formatDay,
  formatTimeRange,
  formatTimestamp,
  pacificDate,
  startOfPacificDay,
} from "@/lib/admin/format";
import { getHistory, type HistoryEntry } from "@/lib/admin/history";
import { getPairKeys, getPlaceMemos } from "@/lib/admin/memo";
import { notificationTarget } from "@/lib/events/mutations";
import { eventOrigin, importCohorts } from "@/lib/events/origin";
import { getSeriesFor } from "@/lib/events/series";
import { findTwins, placeGroupIndex } from "@/lib/events/twins";
import { venueOutcome, type VenueOutcome } from "@/lib/submissions/venue-outcome";
import { findDuplicateGroups } from "@/lib/venues/match";
import {
  EMPTY_PLACE,
  backTarget,
  carryParams,
  comingSaturday,
  daysFromEvent,
  daysFromSubmission,
  detailsFromRow,
  emptyDetails,
  filledDetailCount,
  firstName,
  makeDay,
  weekendOf,
  type EditorDay,
  type EditorMode,
  type EditorValues,
  type EventStatusValue,
  type Stretch,
} from "./model";
import type { PlaceOption } from "./place-checks";
import type { EditorContextData, EditorNav, EditorOptions, EditorPosition, EditorProps, EditorTwin, MarketOption, SubmittedValues } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;

function param(params: SearchParams, key: string): string | null {
  const value = params[key];
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : null;
}

/** Query parameters the editor reads itself; the rest belong to the list the owner came from. */
const EDITOR_PARAMS = ["from", "back", "d", "copy", "apply"];

/**
 * Where the owner came from, and how to get back there. A list's own query parameters (from the
 * Events list without `back`) become `back`, so Next, Previous and a new event keep its filters.
 */
export function editorNav(params: SearchParams, mode: EditorMode): EditorNav {
  const from = param(params, "from");
  const decision = param(params, "d");
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (EDITOR_PARAMS.includes(key)) continue;
    const one = Array.isArray(value) ? value[0] : value;
    if (one) rest[key] = one;
  }
  const listQuery = new URLSearchParams(rest).toString();
  const back = param(params, "back") ?? (from === "events" && listQuery ? `/admin/events?${listQuery}` : null);
  const target = backTarget({ from, back, decision, rest, mode });
  return { backHref: target.href, backLabel: target.label, carry: carryParams({ from, back, decision }), from, decision };
}

const PLACE_SELECT = { id: true, name: true, address: true, city: true, state: true, zip: true, lat: true, lng: true, neighborhood: true } as const;

/**
 * Active places with their event counts, active markets, tags and features, plus the record's
 * own place and market when they are archived, marked as archived.
 */
export async function loadEditorOptions(currentVenueId?: string | null, currentMarketId?: string | null): Promise<EditorOptions> {
  const [venues, current, markets, currentMarket, tags, features, placeMemos] = await Promise.all([
    db.venue.findMany({
      where: { deletedAt: null },
      select: { ...PLACE_SELECT, _count: { select: { events: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    }),
    currentVenueId ? db.venue.findFirst({ where: { id: currentVenueId, deletedAt: { not: null } }, select: PLACE_SELECT }) : null,
    db.market.findMany({ where: { deletedAt: null }, select: { id: true, name: true, venueId: true }, orderBy: { name: "asc" } }),
    currentMarketId
      ? db.market.findFirst({ where: { id: currentMarketId, deletedAt: { not: null } }, select: { id: true, name: true, venueId: true } })
      : null,
    db.tag.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    db.feature.findMany({ select: { id: true, name: true, slug: true, icon: true }, orderBy: { name: "asc" } }),
    getPlaceMemos(),
  ]);
  const places: PlaceOption[] = venues.map(({ _count, ...v }) => ({ ...v, eventCount: _count.events }));
  if (current) places.push({ ...current, eventCount: 0, archived: true });
  const marketOptions: MarketOption[] = currentMarket ? [...markets, { ...currentMarket, archived: true }] : markets;

  const alsoListedAs: Record<string, string[]> = {};
  for (const group of findDuplicateGroups(venues, placeMemos)) {
    for (const venue of group) {
      alsoListedAs[venue.id] = [...new Set(group.filter((v) => v.id !== venue.id && v.name !== venue.name).map((v) => v.name))];
    }
  }
  return { places, markets: marketOptions, tags, features, alsoListedAs };
}

function dayLabel(at: Date, today: string): string {
  const date = pacificDate(at);
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDay(date);
}

/** The newest entries, one per decision, as HistoryList rows whose id is the decision id when undoable. */
export function historyRows(entries: HistoryEntry[], today: string, limit = 3): HistoryListEntry[] {
  const seen = new Set<string>();
  const rows: HistoryListEntry[] = [];
  for (const entry of entries) {
    const key = entry.decisionId ?? entry.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: key,
      day: dayLabel(entry.at, today),
      at: entry.at.toISOString(),
      time: entry.time,
      timestamp: entry.timestamp,
      sentence: entry.sentence,
      canUndo: entry.canUndo && !!entry.decisionId,
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

async function weekendPosition(id: string, saturday: string | null): Promise<EditorPosition | null> {
  if (!saturday) return null;
  const monday = startOfPacificDay(addDays(saturday, -5));
  const nextMonday = startOfPacificDay(addDays(saturday, 2));
  const waiting = await db.event.findMany({
    where: { deletedAt: null, status: { in: ["PENDING", "DRAFT"] }, startDate: { lt: nextMonday }, endDate: { gte: monday } },
    select: { id: true },
    orderBy: [{ startDate: "asc" }, { title: "asc" }, { id: "asc" }],
  });
  const index = waiting.findIndex((e) => e.id === id);
  if (index < 0) return null;
  return {
    index: index + 1,
    total: waiting.length,
    previousId: waiting[index - 1]?.id ?? null,
    nextId: waiting[index + 1]?.id ?? null,
  };
}

async function twinsOf(
  event: { id: string; title: string; startDate: Date; venueId: string },
  venues: PlaceOption[]
): Promise<EditorTwin[]> {
  const day = pacificDate(event.startDate);
  const [candidates, notSame, placeMemos] = await Promise.all([
    db.event.findMany({
      where: {
        deletedAt: null,
        id: { not: event.id },
        status: { in: ["PUBLISHED", "PENDING", "DRAFT"] },
        startDate: { gte: startOfPacificDay(day), lt: startOfPacificDay(addDays(day, 1)) },
      },
      select: { id: true, title: true, startDate: true, venueId: true, status: true },
    }),
    getPairKeys("not-same-event"),
    getPlaceMemos(),
  ]);
  if (candidates.length === 0) return [];
  const groups = placeGroupIndex(findDuplicateGroups(venues, placeMemos));
  const { twins, maybe } = findTwins([event, ...candidates], groups, notSame);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const rows: EditorTwin[] = [];
  for (const [pairs, kind] of [
    [twins, "twins"],
    [maybe, "maybe-twins"],
  ] as const) {
    for (const pair of pairs) {
      if (!pair.ids.includes(event.id)) continue;
      const other = byId.get(pair.ids[0] === event.id ? pair.ids[1] : pair.ids[0]);
      if (!other) continue;
      rows.push({
        id: other.id,
        title: kind === "twins" ? other.title : `Maybe the same: ${other.title}`,
        status: other.status,
        dateLabel: formatDay(pair.date),
        compareHref: `/admin?d=${encodeURIComponent(`${kind}:${pair.key}`)}`,
      });
    }
  }
  return rows;
}

const EVENT_INCLUDE = {
  tags: { select: { id: true } },
  features: { select: { id: true } },
  scheduleDays: { orderBy: { date: "asc" as const } },
  submittedBy: { select: { id: true, name: true, email: true, role: true } },
  submissionFrom: { select: { id: true, submitterName: true } },
};

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof findEvent>>>;

function findEvent(id: string) {
  return db.event.findUnique({ where: { id }, include: EVENT_INCLUDE });
}

/** The form values of an event row. */
function eventValues(event: LoadedEvent, days: EditorDay[]): EditorValues {
  return {
    title: event.title,
    slug: event.slug,
    description: event.description ?? "",
    days,
    venueId: event.venueId,
    place: EMPTY_PLACE,
    marketId: event.marketId ?? "",
    imageUrl: event.imageUrl ?? "",
    showImageInList: event.showImageInList,
    imageFocalX: event.imageFocalX,
    imageFocalY: event.imageFocalY,
    tagIds: event.tags.map((t) => t.id),
    featureIds: event.features.map((f) => f.id),
    websiteUrl: event.websiteUrl ?? "",
    facebookUrl: event.facebookUrl ?? "",
    instagramUrl: event.instagramUrl ?? "",
    participationMode: event.participationMode ?? "",
    vendorCapacity: event.vendorCapacity === null ? "" : String(event.vendorCapacity),
    publicIntentListEnabled: event.publicIntentListEnabled,
    publicIntentNamesEnabled: event.publicIntentNamesEnabled,
    publicRosterEnabled: event.publicRosterEnabled,
    details: detailsFromRow(event as unknown as Record<string, unknown>),
    complianceNotes: event.complianceNotes ?? "",
    status: event.status as EventStatusValue,
  };
}

/** Everything the editor needs for an existing event, or null when there is no such event. */
export async function loadEventEditor(id: string, params: SearchParams, viewerId: string | null): Promise<EditorProps | null> {
  const event = await findEvent(id);
  if (!event) return null;
  const now = new Date();
  const today = pacificDate(now);
  const { days, stretch } = daysFromEvent(event);
  const saturday = weekendOf(days, stretch, today);

  const [options, allCreated, history, series, notifies, position] = await Promise.all([
    loadEditorOptions(event.venueId, event.marketId),
    db.event.findMany({ select: { id: true, createdAt: true } }),
    getHistory({ targetType: "EVENT", targetId: id, limit: 12, viewerId }),
    getSeriesFor(id),
    notificationTarget([id]),
    event.deletedAt ? Promise.resolve(null) : weekendPosition(id, saturday),
  ]);
  const twins = event.deletedAt ? [] : await twinsOf(event, options.places.filter((p) => !p.archived));

  const origin = eventOrigin(
    {
      id: event.id,
      createdAt: event.createdAt,
      fromSubmission: !!event.submissionFrom,
      submittedByRole: event.submittedBy?.role ?? null,
    },
    importCohorts(allCreated)
  );
  const originView =
    origin.kind === "import" && origin.cohort
      ? { label: origin.cohort.label, detail: `${origin.cohort.count} events came in with it`, href: null }
      : origin.kind === "submission"
        ? {
            label: origin.label,
            detail: event.submissionFrom?.submitterName ? `Sent by ${event.submissionFrom.submitterName}` : null,
            href: event.submissionFrom ? `/admin/submissions/${event.submissionFrom.id}` : null,
          }
        : origin.kind === "organizer"
          ? { label: origin.label, detail: event.submittedBy?.name ?? event.submittedBy?.email ?? null, href: event.submittedBy ? `/admin/users/${event.submittedBy.id}` : null }
          : { label: origin.label, detail: null, href: null };

  const context: EditorContextData = {
    today,
    stretch,
    notifies: notifies.map(firstName),
    position,
    nav: editorNav(params, "event"),
    origin: originView,
    twins,
    history: historyRows(history, today),
    historyHref: `/admin/audit-log?q=${encodeURIComponent(id)}&when=all`,
    series: series ? { name: series.name, total: series.eventIds.length, index: series.eventIds.indexOf(id) + 1 } : null,
    applyToAll: !!series && param(params, "apply") === "all",
    detailsFilled: filledDetailCount(event as unknown as Record<string, unknown>),
    submission: null,
    copiedFrom: null,
  };
  return {
    record: {
      mode: "event",
      id,
      title: event.title,
      status: event.status as EventStatusValue,
      archived: !!event.deletedAt,
      slug: event.slug,
      updatedAt: event.updatedAt.toISOString(),
    },
    initial: eventValues(event, days),
    options,
    context,
  };
}

function blankValues(today: string): EditorValues {
  return {
    title: "",
    slug: "",
    description: "",
    days: [makeDay(comingSaturday(today), "10:00", "16:00")],
    venueId: "",
    place: EMPTY_PLACE,
    marketId: "",
    imageUrl: "",
    showImageInList: true,
    imageFocalX: 50,
    imageFocalY: 50,
    tagIds: [],
    featureIds: [],
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    participationMode: "",
    vendorCapacity: "",
    publicIntentListEnabled: null,
    publicIntentNamesEnabled: null,
    publicRosterEnabled: null,
    details: emptyDetails(),
    complianceNotes: "",
    status: "DRAFT",
  };
}

/** A copy of a stretch or its days one week later, for "Copy as next date". */
function nextWeek(days: EditorDay[], stretch: Stretch | null): EditorDay[] {
  if (days.length > 0) return days.map((d) => makeDay(addDays(d.date, 7), d.startTime, d.endTime, d.allDay));
  if (!stretch) return [];
  const out: EditorDay[] = [];
  for (let date = stretch.startDate; date <= stretch.endDate && out.length < 31; date = addDays(date, 1)) {
    out.push(makeDay(addDays(date, 7), stretch.startTime, stretch.endTime));
  }
  return out;
}

/** The empty editor, or a copy of `?copy=<id>` one week later. */
export async function loadNewEditor(params: SearchParams): Promise<EditorProps> {
  const today = pacificDate(new Date());
  const copyId = param(params, "copy");
  const source = copyId ? await findEvent(copyId) : null;
  let initial = blankValues(today);
  if (source) {
    const { days, stretch } = daysFromEvent(source);
    initial = {
      ...eventValues(source, nextWeek(days, stretch)),
      slug: "",
      complianceNotes: "",
      status: "DRAFT",
      venueId: source.venueId,
    };
  }
  const options = await loadEditorOptions(source?.venueId);
  if (source && options.places.find((p) => p.id === source.venueId)?.archived) initial.venueId = "";
  if (initial.marketId && !options.markets.some((m) => m.id === initial.marketId)) initial.marketId = "";
  return {
    record: { mode: "new", id: null, title: "New event", status: null, archived: false, slug: null, updatedAt: null },
    initial,
    options,
    context: {
      today,
      stretch: null,
      notifies: [],
      position: null,
      nav: editorNav(params, "new"),
      origin: null,
      twins: [],
      history: [],
      historyHref: null,
      series: null,
      applyToAll: false,
      detailsFilled: source ? filledDetailCount(source as unknown as Record<string, unknown>) : 0,
      submission: null,
      copiedFrom: source ? { id: source.id, title: source.title } : null,
    },
  };
}

type SubmissionRow = NonNullable<Awaited<ReturnType<typeof findSubmission>>>;

function findSubmission(id: string) {
  return db.submission.findUnique({
    where: { id },
    include: { createdEvent: { select: { id: true, slug: true, title: true, status: true, deletedAt: true } } },
  });
}

/** The submission as it was sent: the oldest previous value of every field later edits changed. */
export function originalFields<T extends Record<string, unknown>>(current: T, edits: { previousValue?: Record<string, unknown> | null }[]): T {
  const original: Record<string, unknown> = { ...current };
  const seen = new Set<string>();
  for (const edit of edits) {
    for (const [key, value] of Object.entries(edit.previousValue ?? {})) {
      if (seen.has(key) || !(key in current)) continue;
      seen.add(key);
      original[key] = value;
    }
  }
  return original as T;
}

function whenLines(days: EditorDay[]): string[] {
  return days.map((d) => `${formatDay(d.date)}, ${d.allDay ? "all day" : d.startTime && d.endTime ? formatTimeRange(d.startTime, d.endTime) : "no hours given"}`);
}

/** Everything the editor needs for a submission, or null when there is no such submission. */
export async function loadSubmissionEditor(id: string, params: SearchParams, viewerId: string | null): Promise<EditorProps | null> {
  const s = await findSubmission(id);
  if (!s) return null;
  const today = pacificDate(new Date());
  const [options, history, edits, account] = await Promise.all([
    loadEditorOptions(null, s.marketId),
    getHistory({ targetType: "SUBMISSION", targetId: id, limit: 12, viewerId }),
    db.auditLog.findMany({
      where: { action: "UPDATE_SUBMISSION", targetType: "SUBMISSION", targetId: id },
      orderBy: { createdAt: "asc" },
      select: { metadata: true },
    }),
    db.user.findUnique({ where: { email: s.submitterEmail }, select: { id: true } }),
  ]);

  const sent = originalFields(s as unknown as Record<string, unknown>, edits.map((e) => (e.metadata ?? {}) as { previousValue?: Record<string, unknown> })) as unknown as SubmissionRow;
  const tagName = new Map(options.tags.map((t) => [t.id, t.name]));
  const featureName = new Map(options.features.map((f) => [f.id, f.name]));
  const marketName = new Map(options.markets.map((m) => [m.id, m.name]));
  const original: SubmittedValues = {
    title: sent.eventTitle,
    description: sent.eventDescription,
    when: whenLines(daysFromSubmission(sent)),
    place: [sent.venueName, sent.venueAddress, [sent.venueCity, [sent.venueState, sent.venueZip].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(", "),
    market: sent.marketId ? (marketName.get(sent.marketId) ?? null) : null,
    tags: (sent.tagIds ?? []).map((t) => tagName.get(t) ?? t),
    features: (sent.featureIds ?? []).map((f) => featureName.get(f) ?? f),
    picture: sent.imageUrl,
    links: [sent.websiteUrl, sent.facebookUrl, sent.instagramUrl].filter((l): l is string => !!l),
  };

  let outcome: VenueOutcome | null = null;
  if (s.status === "PENDING") {
    try {
      outcome = await venueOutcome(s);
    } catch (err) {
      console.error(`[admin/editor] checking the place of submission ${id} failed:`, err);
    }
  }

  const days = daysFromSubmission(s);
  const initial: EditorValues = {
    ...blankValues(today),
    title: s.eventTitle,
    description: s.eventDescription ?? "",
    days,
    place: {
      name: s.venueName,
      address: s.venueAddress,
      city: s.venueCity ?? "",
      state: s.venueState ?? "",
      zip: s.venueZip ?? "",
    },
    marketId: s.marketId ?? "",
    imageUrl: s.imageUrl ?? "",
    tagIds: s.tagIds ?? [],
    featureIds: s.featureIds ?? [],
    websiteUrl: s.websiteUrl ?? "",
    facebookUrl: s.facebookUrl ?? "",
    instagramUrl: s.instagramUrl ?? "",
    status: "PENDING",
  };
  const created = s.createdEvent && !s.createdEvent.deletedAt ? s.createdEvent : null;
  return {
    record: {
      mode: "submission",
      id,
      title: s.eventTitle,
      status: null,
      archived: false,
      slug: null,
      updatedAt: s.updatedAt.toISOString(),
    },
    initial,
    options,
    context: {
      today,
      stretch: null,
      notifies: account ? [firstName(s.submitterName)] : [],
      position: null,
      nav: editorNav(params, "submission"),
      origin: null,
      twins: [],
      history: historyRows(history, today),
      historyHref: `/admin/audit-log?q=${encodeURIComponent(id)}&when=all`,
      series: null,
      applyToAll: false,
      detailsFilled: 0,
      submission: {
        status: s.status as "PENDING" | "APPROVED" | "REJECTED",
        submitterName: s.submitterName,
        submitterEmail: s.submitterEmail,
        sentAt: formatTimestamp(s.createdAt),
        notes: s.notes,
        hasAccount: !!account,
        original,
        outcome,
        createdEvent: created ? { id: created.id, slug: created.slug, title: created.title, status: created.status } : null,
        reviewNotes: s.reviewNotes,
      },
      copiedFrom: null,
    },
  };
}

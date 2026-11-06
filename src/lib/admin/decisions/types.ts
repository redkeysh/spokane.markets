import type { Readiness, ReadinessFlag, ReadinessVenue, ScheduleDayRow } from "@/lib/events/readiness";
import type { TwinPair } from "@/lib/events/twins";
import type { Area } from "../regions";
import type { PublicDecisionItems } from "../inbox/public-items";

export type DecisionKind =
  | "ready"
  | "single"
  | "gone"
  | "approved-unpublished"
  | "looks-wrong"
  | "submission"
  | "trade-shows"
  | "twins"
  | "maybe-twins"
  | "series"
  | "place-duplicates"
  | "zip-neighborhood"
  | "spelling"
  | "archived-in-use"
  | "unused-places"
  | "review"
  | "photo"
  | "report"
  | "application"
  | "message"
  | "market-verification";

/** "public", "week:2026-11-07", "later", "gone" or "places". */
export type DecisionLane = "public" | `week:${string}` | "later" | "gone" | "places";

export type DecisionRowType =
  | "event"
  | "submission"
  | "venue"
  | "market"
  | "review"
  | "photo"
  | "report"
  | "application"
  | "message";

export type DecisionRow = {
  type: DecisionRowType;
  id: string;
  title?: string;
  status?: string;
  /** Pacific date the row first happens on or after today. */
  firstDate?: string;
  /** Readiness flags (blocking first) for event rows. */
  flags?: ReadinessFlag[];
};

/** What the decision's filled button does. */
export type DecisionAction =
  | "publish"
  | "publish-submission"
  | "reject"
  | "archive"
  /** Publishes `suggestedKeepId` and archives the other settled rows as its duplicates. */
  | "keep-one"
  /** Archives the settled rows as duplicates of `suggestedKeepId`, whose status stays as it is. */
  | "archive-duplicates"
  | "compare"
  | "fix-hours"
  | "add-picture"
  | "edit"
  | "merge"
  | "set-neighborhood"
  | "approve";

export type Decision = {
  /** Stable: "ready:2026-11-07", "twins:<idA>|<idB>", "series:<slug-core>@<placeGroup>", ... */
  key: string;
  kind: DecisionKind;
  lane: DecisionLane;
  /** Plain words, e.g. "Rebel Junk Holiday Market, twice". */
  title: string;
  /** The second line in the pile, e.g. "8 events, no pictures". */
  detail?: string;
  rows: DecisionRow[];
  /** Event ids the decision changes, for the rail's reach ring. */
  settles: string[];
  /** `notifies` names the people the action tells (cannot be unsent). */
  primary: { label: string; action: DecisionAction; notifies?: string[] };
  /** For ordering inside a lane. */
  firstDate?: string;
  /** When the public sent it (ISO); From the public is ordered oldest first. */
  sentAt?: string;
  /** Higher comes first in From the public: 2 for a critical report, 1 for a high one. */
  urgency?: number;
  /** For twins: the id to keep (a live or otherwise decided copy, else the fullest listing). */
  suggestedKeepId?: string;
};

export type DecisionEvent = {
  id: string;
  title: string;
  slug: string;
  status: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  scheduleDays: ScheduleDayRow[];
  description: string | null;
  imageUrl: string | null;
  websiteUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tagCount: number;
  featureCount: number;
  marketId: string | null;
  marketName: string | null;
  venue: ReadinessVenue;
  /** The submitter's account; `alertsOn` is false when they turned organizer alerts off. */
  submittedBy: { id: string; name: string; role: string; alertsOn: boolean } | null;
  /** The public submission this event was created from. */
  submission: { id: string; status: string } | null;
};

export type DecisionSubmission = {
  id: string;
  title: string;
  createdAt: Date;
  submitterName: string;
  /** True when the submitter has an account, so publishing notifies them. */
  submitterHasAccount: boolean;
  /** Pacific dates, sorted. */
  dates: string[];
  venueName: string;
  venueCity: string | null;
};

export type DecisionVenue = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  deletedAt: Date | null;
  /** Events and markets (not archived) that point at the place. Place decisions are filed only for places that carry it. */
  uses?: { events: number; markets: number };
};

export type DecisionMemo = { kind: string; key: string; until: Date | null };

export type DecisionInput = {
  now: Date;
  /** Waiting events (ended or not) and upcoming published ones. */
  events: DecisionEvent[];
  /** Creation times of every event, archived included, for finding imports; defaults to `events`. */
  importRows?: { id: string; createdAt: Date }[];
  submissions: DecisionSubmission[];
  venues: DecisionVenue[];
  memos: DecisionMemo[];
  /** The neighborhood list; place decisions for ZIPs without a neighborhood are filed only when it is given. */
  neighborhoods?: { slug: string; label: string; isActive: boolean }[];
  /** Reviews, photos, reports, applications, messages and markets waiting on the owner. */
  publicItems?: PublicDecisionItems;
};

export type DecisionContext = {
  now: Date;
  today: string;
  /** The rail's Saturdays, this week's first. */
  saturdays: string[];
  input: DecisionInput;
  eventById: Map<string, DecisionEvent>;
  /** Pending and Draft events, ended or not. */
  waiting: DecisionEvent[];
  readiness: Map<string, Readiness>;
  /** Duplicate groups among active places, found once per build. */
  duplicateGroups: DecisionVenue[][];
  /** venue id to duplicate group id. */
  placeGroups: Map<string, string>;
  duplicateVenueIds: Set<string>;
  /** Pair keys the owner marked as different events. */
  notSameEvent: Set<string>;
  /** Event ids already in a higher-precedence decision. */
  claimed: Set<string>;
  /** Twin and maybe-twin pairs among upcoming Pending, Draft and Published events. */
  twins(): { twins: TwinPair[]; maybe: TwinPair[] };
  /** Pacific dates an event happens on or after today. */
  upcomingDates(event: DecisionEvent): string[];
  laneOf(event: DecisionEvent): DecisionLane;
  ended(event: DecisionEvent): boolean;
  /** Waiting events no earlier kind has claimed. */
  unclaimedWaiting(): DecisionEvent[];
  row(event: DecisionEvent): DecisionRow;
  /** Names of submitters a status change of these events would tell. */
  notifies(events: DecisionEvent[]): string[];
};

export type DecisionKindDefinition = {
  kind: DecisionKind;
  /** Event kinds claim their event rows, so lower-precedence kinds skip them. */
  claimsEvents: boolean;
  find: (context: DecisionContext) => Decision[];
};

export type LaneSummary = {
  lane: DecisionLane;
  /** "This weekend, Nov 6 to 8", "Later", "Already happened", "Places, no deadline", "From the public". */
  label: string;
  /** The Saturday for weekend lanes. */
  saturday: string | null;
  /** Pending and Draft rows (or public items) in the lane. */
  waiting: number;
  /** Published rows, for weekend lanes. */
  live: number;
  decisions: number;
  /** Weekend lanes: live and total per area. */
  areas: { area: Area; live: number; total: number }[];
  /** Weekend lanes: where the rows came from. */
  origins: { source: string; live: number; total: number }[];
};

export type DecisionsResult = {
  today: string;
  /** Lane order, then by rows settled, then by date. Snoozed decisions are left out. */
  decisions: Decision[];
  /** Decisions under an active "later" memo, with when they come back. */
  snoozed: { decision: Decision; until: Date }[];
  lanes: LaneSummary[];
  /** Active places in a duplicate group. */
  duplicateVenueIds: Set<string>;
};

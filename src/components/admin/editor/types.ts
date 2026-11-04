import type { HistoryListEntry } from "@/components/admin/kit/history-list";
import type { VenueOutcome } from "@/lib/submissions/venue-outcome";
import type { EditorMode, EditorValues, EventStatusValue, Stretch } from "./model";
import type { PlaceOption } from "./place-checks";

/** `archived` is set only on the record's own market when it is archived. */
export type MarketOption = { id: string; name: string; venueId: string | null; archived?: boolean };
export type TagOption = { id: string; name: string; slug: string };
export type FeatureOption = { id: string; name: string; slug: string; icon: string | null };

/** The choices the pickers offer: active places and markets (and the record's own when archived), every tag and feature. */
export type EditorOptions = {
  places: PlaceOption[];
  markets: MarketOption[];
  tags: TagOption[];
  features: FeatureOption[];
  /** Place id to the other names of its duplicate group. */
  alsoListedAs: Record<string, string[]>;
};

export type EditorRecord = {
  mode: EditorMode;
  /** The event or submission id; null for a new event. */
  id: string | null;
  /** The saved title, for the header and the tab. */
  title: string;
  /** The saved status of an event. */
  status: EventStatusValue | null;
  archived: boolean;
  /** The saved web address of an event. */
  slug: string | null;
  updatedAt: string | null;
};

export type EditorNav = {
  backHref: string;
  backLabel: string;
  /** Query string carried to the next and previous record ("?from=todo&d=..."). */
  carry: string;
  from: string | null;
  /** The To do decision key the owner came from. */
  decision: string | null;
};

export type EditorPosition = {
  /** 1-based. */
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
};

export type EditorTwin = { id: string; title: string; status: string; dateLabel: string; compareHref: string | null };

export type EditorSeries = { name: string; total: number; index: number };

export type SubmittedValues = {
  title: string;
  description: string | null;
  when: string[];
  place: string;
  market: string | null;
  tags: string[];
  features: string[];
  picture: string | null;
  links: string[];
};

export type SubmissionInfo = {
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitterName: string;
  submitterEmail: string;
  /** "Nov 2, 2026 at 4:10 pm" */
  sentAt: string;
  notes: string | null;
  /** True when the submitter has an account, so publishing tells them. */
  hasAccount: boolean;
  original: SubmittedValues;
  /** What publishing does with the place, for the saved place fields. */
  outcome: VenueOutcome | null;
  createdEvent: { id: string; slug: string; title: string; status: string } | null;
  reviewNotes: string | null;
};

export type EditorContextData = {
  /** Pacific date of today. */
  today: string;
  /** An event that runs as one stretch with no daily hours. */
  stretch: Stretch | null;
  /** First names of the people a publish would tell. */
  notifies: string[];
  position: EditorPosition | null;
  nav: EditorNav;
  origin: { label: string; detail: string | null; href: string | null } | null;
  twins: EditorTwin[];
  history: HistoryListEntry[];
  historyHref: string | null;
  series: EditorSeries | null;
  /** Opened with "all dates" of the series chosen (`?apply=all`). */
  applyToAll: boolean;
  /** How many of the 33 onboarding columns hold a value. */
  detailsFilled: number;
  submission: SubmissionInfo | null;
  /** The event a new one was copied from. */
  copiedFrom: { id: string; title: string } | null;
};

export type EditorProps = {
  record: EditorRecord;
  initial: EditorValues;
  options: EditorOptions;
  context: EditorContextData;
};

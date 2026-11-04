import type { Decision, DecisionKind, DecisionLane, LaneSummary } from "@/lib/admin/decisions/types";
import type { Area } from "@/lib/admin/regions";
import type { ReadinessIssue, ScheduleDayRow } from "@/lib/events/readiness";

export type { Decision, DecisionKind, DecisionLane, LaneSummary };

export type TodoLink = { kind: "website" | "facebook" | "instagram"; href: string; label: string };

/** One event as the decision panes show it. Dates are Pacific "YYYY-MM-DD"; labels are preformatted. */
export type TodoEvent = {
  id: string;
  title: string;
  slug: string;
  status: string;
  /** Every Pacific date it happens on, sorted. */
  dates: string[];
  /** The first date on or after today, else its first date. */
  firstDate: string;
  /** "Sat 11 am" */
  startLabel: string;
  /** One line per day ("Sat Nov 7, 10:00 am to 4:00 pm"), or one stretch line. */
  when: string[];
  /** "Fri 6:00 pm to Sat 4:00 pm", for side-by-side comparison. */
  whenShort: string;
  /** "Sat Dec 12 to Sun Dec 13" */
  dateRange: string;
  startIso: string;
  endIso: string;
  scheduleDays: ScheduleDayRow[];
  venue: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    neighborhood: string | null;
    archived: boolean;
  };
  area: Area;
  description: string | null;
  importerNote: boolean;
  imageUrl: string | null;
  pictureIsPage: boolean;
  links: TodoLink[];
  tags: { id: string; name: string }[];
  features: { id: string; name: string }[];
  marketName: string | null;
  /** The vendor settings the description's chips can set, as stored. */
  vendorApplicationState: string | null;
  feeModelVendor: string | null;
  /** "Import of Oct 30 (47 events)", "Sent from the site", "Added by hand". */
  origin: string;
  /** The submitter a publish or rejection tells, when alerts are on. */
  notifies: string | null;
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
};

/** What approving a submission does with its place, in plain words. */
export type TodoPlaceLine = {
  outcome: "existing" | "new" | "archived" | "incomplete" | "unplaceable" | "unknown";
  text: string;
  missing?: string[];
  nearest?: { venueId: string; name: string; address: string; meters: number };
};

export type TodoSubmission = {
  id: string;
  title: string;
  description: string | null;
  submitterName: string;
  submitterEmail: string;
  /** "Nov 2, 2026 at 4:10 pm" */
  sentAt: string;
  dates: string[];
  firstDate: string;
  when: string[];
  dateRange: string;
  venue: { name: string; address: string; city: string; state: string; zip: string };
  place: TodoPlaceLine;
  tags: string[];
  features: string[];
  imageUrl: string | null;
  pictureIsPage: boolean;
  links: TodoLink[];
  notes: string | null;
  notifies: string | null;
};

export type TodoLane = LaneSummary & {
  /** Published events that happen in this lane's week, by start. */
  liveEventIds: string[];
  /** Rejected, cancelled or archived events in this lane's week. */
  keptOff: number;
  /** "Fri Nov 6 to Sun Nov 8" for weekend lanes. */
  span: string | null;
};

export type TodoDoneItem = {
  decisionId: string | null;
  at: string;
  time: string;
  sentence: string;
  canUndo: boolean;
  undone: boolean;
};

export type TodoSnoozed = { decision: Decision; until: string; /** "Back Wed Nov 4" */ back: string };

/** What a To do server action reports. `decisionId` groups its audit entries for Undo. */
export type TodoActionResult =
  | {
      ok: true;
      decisionId: string | null;
      changed: string[];
      alreadyThere: string[];
      refused: { id: string; reason: string }[];
      notified: string[];
      /** Events archived by the decision. */
      archived?: string[];
    }
  | { ok: false; error: string };

export type TodoUndoResult = { ok: boolean; message: string };

export type TodoHistoryLine = { id: string; time: string; timestamp: string; sentence: string };

/** An active place the decision panes can move an event to. */
export type TodoPlaceOption = {
  id: string;
  /** "Kootenai County Fairgrounds, Coeur d'Alene", with the street when two share a name and city. */
  label: string;
  /** Why an event there cannot be published yet ("Can't publish yet: no ZIP."), or null. */
  problem: string | null;
};

/** What the in-place editors offer, sorted by name. */
export type TodoOptions = {
  places: TodoPlaceOption[];
  tags: { id: string; name: string }[];
  features: { id: string; name: string }[];
};

export type TodoData = {
  /** ISO instant the page was built. */
  now: string;
  /** Pacific date. */
  today: string;
  decisions: Decision[];
  snoozed: TodoSnoozed[];
  lanes: TodoLane[];
  events: Record<string, TodoEvent>;
  submissions: Record<string, TodoSubmission>;
  doneToday: TodoDoneItem[];
  options: TodoOptions;
};

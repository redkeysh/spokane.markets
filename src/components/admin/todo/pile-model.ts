import { publishLabel } from "@/lib/admin/decisions/kinds/shared";
import { addDays, formatShortDate, saturdayOf } from "@/lib/admin/format";
import type { Area } from "@/lib/admin/regions";
import type { Decision, DecisionLane, TodoEvent, TodoLane } from "./types";

export type PileItem =
  | { id: string; type: "brief"; lane: DecisionLane }
  | { id: string; type: "decision"; lane: DecisionLane; decision: Decision }
  | { id: string; type: "lane"; lane: DecisionLane };

export type PileSection = {
  lane: TodoLane;
  open: boolean;
  /** Focusable rows in display order: a collapsed lane is its one lane row; a quiet empty lane has none. */
  items: PileItem[];
  /** Decisions of an open weekend lane left out by the area filter. */
  filteredOut: number;
};

export type PileScope = "all" | "events" | "places" | "public";

export const PILE_SCOPES: { value: PileScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "events", label: "Events" },
  { value: "places", label: "Places" },
  { value: "public", label: "Public" },
];

export type PileState = {
  openLane: DecisionLane;
  scope: PileScope;
  area: Area | null;
  /** Decision keys already decided here, hidden until the server agrees. */
  hidden: ReadonlySet<string>;
  /** Batch keys the owner chose to treat one by one. */
  split: ReadonlySet<string>;
};

export type PileInput = { decisions: Decision[]; lanes: TodoLane[]; events: Record<string, TodoEvent> };

export const isWeekLane = (lane: DecisionLane): lane is `week:${string}` => lane.startsWith("week:");

/** Weekend lanes and Later: the lanes the rail draws and [ ] step through. */
export const isRailLane = (lane: DecisionLane) => isWeekLane(lane) || lane === "later";

/** The rail's key for a lane: "2026-11-07", "later", or null. */
export function weekKeyOf(lane: DecisionLane): string | null {
  if (isWeekLane(lane)) return lane.slice(5);
  return lane === "later" ? "later" : null;
}

const NON_WEEK: ReadonlySet<string> = new Set(["public", "later", "gone", "places"]);

/** A lane from the URL: ?week=2026-11-07, ?week=later, or ?lane=public. */
export function laneFromParams(week: string | null, lane: string | null, lanes: TodoLane[]): DecisionLane | null {
  const known = new Set(lanes.map((l) => l.lane));
  if (week) {
    const candidate: DecisionLane = week === "later" ? "later" : `week:${week}`;
    if (known.has(candidate)) return candidate;
  }
  if (lane && NON_WEEK.has(lane) && known.has(lane as DecisionLane)) return lane as DecisionLane;
  return null;
}

/** This weekend's lane, the one To do opens on. */
export function defaultLane(lanes: TodoLane[]): DecisionLane {
  return lanes.find((l) => isWeekLane(l.lane))?.lane ?? lanes[0]?.lane ?? "later";
}

export const briefItemId = (lane: DecisionLane) => `brief:${lane}`;
export const decisionItemId = (key: string) => `d:${key}`;
export const laneItemId = (lane: DecisionLane) => `lane:${lane}`;

/** The lane a date falls in: its weekend on the rail, else Later. */
export function laneForDate(date: string, lanes: TodoLane[]): DecisionLane {
  const saturdays = lanes.map((l) => l.saturday).filter((s): s is string => !!s);
  if (saturdays.length === 0) return "later";
  if (date > addDays(saturdays[saturdays.length - 1], 1)) return "later";
  const saturday = saturdayOf(date);
  return saturdays.includes(saturday) ? `week:${saturday}` : `week:${saturdays[0]}`;
}

/** One single decision per row of a batch, each in the lane of its first date. */
export function splitDecision(decision: Decision, input: PileInput): Decision[] {
  return decision.rows
    .filter((row) => row.type === "event" && input.events[row.id])
    .map((row) => {
      const event = input.events[row.id];
      const notifies = event.notifies ? [event.notifies] : [];
      const blocking = event.blocking[0]?.message;
      return {
        key: `single:${row.id}`,
        kind: "single" as const,
        lane: laneForDate(event.firstDate, input.lanes),
        title: event.title,
        detail:
          blocking ??
          (event.warnings.length
            ? event.warnings.map((w, i) => (i > 0 && /^(No|The) /.test(w.message) ? w.message[0].toLowerCase() + w.message.slice(1) : w.message)).join(", ")
            : "Ready to publish"),
        rows: [row],
        settles: [row.id],
        primary: { label: publishLabel("Publish", notifies), action: "publish" as const, notifies },
        firstDate: event.firstDate,
      };
    });
}

/** Decisions after hiding decided ones and splitting batches, in pile order. */
export function visibleDecisions(input: PileInput, state: Pick<PileState, "hidden" | "split">): Decision[] {
  const out: Decision[] = [];
  const singles: Decision[] = [];
  for (const decision of input.decisions) {
    if (state.split.has(decision.key)) {
      singles.push(...splitDecision(decision, input));
      continue;
    }
    if (!state.hidden.has(decision.key)) out.push(decision);
  }
  if (singles.length === 0) return out;
  const visibleSingles = singles.filter((d) => !state.hidden.has(d.key));
  const laneOrder = input.lanes.map((l) => l.lane);
  const merged = [...out];
  for (const single of visibleSingles) {
    const lane = laneOrder.indexOf(single.lane);
    let at = merged.findIndex((d) => laneOrder.indexOf(d.lane) > lane);
    if (at < 0) at = merged.length;
    merged.splice(at, 0, single);
  }
  return merged;
}

function inScope(lane: DecisionLane, scope: PileScope): boolean {
  if (scope === "all") return true;
  if (scope === "places") return lane === "places";
  if (scope === "public") return lane === "public";
  return lane !== "places" && lane !== "public";
}

function matchesArea(decision: Decision, area: Area, events: Record<string, TodoEvent>): boolean {
  return decision.rows.some((row) => row.type === "event" && events[row.id]?.area === area);
}

/**
 * The pile: From the public on top while it holds anything, the weekend lanes, Later, Already
 * happened, Places, then From the public when it is empty. The open lane lists its decisions
 * (a weekend lane starts with its brief); other lanes are one row each.
 */
export function buildPile(input: PileInput, state: PileState): { sections: PileSection[]; items: PileItem[]; decisions: Decision[] } {
  const decisions = visibleDecisions(input, state);
  const byLane = new Map<DecisionLane, Decision[]>();
  for (const d of decisions) byLane.set(d.lane, [...(byLane.get(d.lane) ?? []), d]);

  const publicLane = input.lanes.find((l) => l.lane === "public");
  const publicBusy = (byLane.get("public")?.length ?? 0) > 0;
  const ordered = [
    ...(publicLane && publicBusy ? [publicLane] : []),
    ...input.lanes.filter((l) => l.lane !== "public"),
    ...(publicLane && !publicBusy ? [publicLane] : []),
  ].filter((l) => inScope(l.lane, state.scope));

  const sections: PileSection[] = ordered.map((lane) => {
    const laneDecisions = byLane.get(lane.lane) ?? [];
    const week = isWeekLane(lane.lane);
    const open = lane.lane === state.openLane || (lane.lane === "public" && laneDecisions.length > 0);
    if (!open) {
      const focusable = week || laneDecisions.length > 0;
      return { lane, open, items: focusable ? [{ id: laneItemId(lane.lane), type: "lane", lane: lane.lane }] : [], filteredOut: 0 };
    }
    const shown = week && state.area ? laneDecisions.filter((d) => matchesArea(d, state.area!, input.events)) : laneDecisions;
    const items: PileItem[] = [
      ...(week ? [{ id: briefItemId(lane.lane), type: "brief" as const, lane: lane.lane }] : []),
      ...shown.map((decision) => ({ id: decisionItemId(decision.key), type: "decision" as const, lane: lane.lane, decision })),
    ];
    return { lane, open, items, filteredOut: laneDecisions.length - shown.length };
  });

  return { sections, items: sections.flatMap((s) => s.items), decisions };
}

/** Where the cursor lands when a lane opens: its first row going down, its last going up. */
export function enterLane(input: PileInput, state: PileState, lane: DecisionLane, edge: "first" | "last"): string | null {
  const { sections } = buildPile(input, { ...state, openLane: lane });
  const section = sections.find((s) => s.lane.lane === lane);
  if (!section || section.items.length === 0) return null;
  return (edge === "first" ? section.items[0] : section.items[section.items.length - 1]).id;
}

export type CursorMove = { openLane: DecisionLane; cursor: string };

/**
 * j / k: the next or previous row. Reaching a collapsed lane opens it, and the cursor lands on
 * its first row going down or its last going up. Stops at either end of the pile.
 */
export function moveCursor(input: PileInput, state: PileState, cursor: string, delta: 1 | -1): CursorMove | null {
  const { items } = buildPile(input, state);
  const from = items.findIndex((i) => i.id === cursor);
  const to = from < 0 ? 0 : from + delta;
  const target = items[to];
  if (!target || to === from) return null;
  if (target.type !== "lane") return { openLane: state.openLane, cursor: target.id };
  const landed = enterLane(input, state, target.lane, delta > 0 ? "first" : "last");
  return landed ? { openLane: target.lane, cursor: landed } : { openLane: state.openLane, cursor: target.id };
}

/**
 * [ and ]: the previous or next weekend lane (Later counts as the last). Past either end there is
 * no lane, which clears the weekend choice.
 */
export function stepWeek(lanes: TodoLane[], openLane: DecisionLane, delta: 1 | -1): DecisionLane | null {
  const weeks: DecisionLane[] = lanes.map((l) => l.lane).filter(isRailLane);
  if (weeks.length === 0) return null;
  const at = weeks.indexOf(openLane);
  if (at < 0) return delta > 0 ? weeks[0] : weeks[weeks.length - 1];
  return weeks[at + delta] ?? null;
}

/**
 * Where the cursor goes once `decidedKey` is decided from `cursor`: from the brief, to the lane's
 * first remaining decision; from the decision, to the next decision of its lane, else back to
 * the lane's brief (which then says the weekend is set), else a neighbor.
 */
export function cursorAfterDecision(items: PileItem[], cursor: string, decidedKey: string): string | null {
  const decidedId = decisionItemId(decidedKey);
  const at = items.findIndex((i) => i.id === cursor);
  if (at < 0) return null;
  const current = items[at];
  const remaining = (i: PileItem) => i.id !== decidedId;
  if (current.type === "brief") {
    return items.find((i) => i.lane === current.lane && i.type === "decision" && remaining(i))?.id ?? current.id;
  }
  const next = items.slice(at + 1).find(remaining);
  if (next && next.lane === current.lane && next.type === "decision") return next.id;
  const brief = items.find((i) => i.type === "brief" && i.lane === current.lane);
  if (brief) return brief.id;
  const previous = [...items.slice(0, at)].reverse().find(remaining);
  return (previous?.lane === current.lane ? previous.id : null) ?? next?.id ?? previous?.id ?? null;
}

/** "this weekend", "next weekend", "the weekend of Nov 21", "later", "already happened". */
export function laneWord(lane: DecisionLane, lanes: TodoLane[]): string {
  if (lane === "public") return "from the public";
  if (lane === "gone") return "already happened";
  if (lane === "places") return "places";
  if (lane === "later") return "later";
  const weeks = lanes.filter((l) => isWeekLane(l.lane));
  const at = weeks.findIndex((l) => l.lane === lane);
  if (at === 0) return "this weekend";
  if (at === 1) return "next weekend";
  return `the weekend of ${formatShortDate(lane.slice(5))}`;
}

/** "2 of 10, this weekend". */
export function positionText(decision: Decision, decisions: Decision[], lanes: TodoLane[]): string {
  const inLane = decisions.filter((d) => d.lane === decision.lane);
  const at = inLane.findIndex((d) => d.key === decision.key);
  const word = laneWord(decision.lane, lanes);
  return at < 0 ? word : `${at + 1} of ${inLane.length}, ${word}`;
}

/** The one-line fact of a collapsed lane: "14 waiting", "Nothing waiting". */
export function laneFact(lane: TodoLane, decisionCount: number): string {
  if (decisionCount === 0) return "Nothing waiting";
  return `${lane.waiting || decisionCount} waiting`;
}

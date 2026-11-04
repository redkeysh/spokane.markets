import { daysBetween, formatLongDay, formatWeekendSpan } from "@/lib/admin/format";
import { localDayName } from "@/lib/admin/local-days";
import type { Decision, DecisionKind, DecisionLane, TodoLane } from "./types";
import { isRailLane, isWeekLane } from "./pile-model";

export type BriefAction =
  | { kind: "publish-ready"; decisionKey: string; label: string }
  | { kind: "goto"; decisionKey: string; label: string }
  | { kind: "open-lane"; lane: DecisionLane; label: string };

export type BriefLine = { text: string; action?: BriefAction };

export type Brief = {
  title: string;
  lines: BriefLine[];
  footer: string | null;
  /** True when nothing in the lane waits on a decision. */
  done: boolean;
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "A, B or C", with no comma before the last item. */
export function listOr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function listAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "Rebel Junk" from "Rebel Junk Holiday Market, twice": the name without its count, cut to two words when long. */
export function shortName(title: string): string {
  const name = title.replace(/, (twice|\d+ times|\d+ dates)$/, "").trim();
  const words = name.split(/\s+/);
  return words.length > 3 ? words.slice(0, 2).join(" ") : name;
}

function seriesName(title: string): string {
  return title.replace(/, \d+ dates$/, "").trim();
}

const LOOKS_WRONG_PHRASE: Record<string, string> = {
  "no picture": "with no picture",
  "no daily hours": "with no daily hours",
  "closes before it opens": "but one day closes before it opens",
  "opens at 12:00 am": "but one day opens at 12:00 am",
  "place archived": "but its place is archived",
};

/** "Yuletide Holiday Marketplace is live on Friday with no picture." */
export function looksWrongSentence(decision: Decision): string {
  const [name, problem = ""] = decision.title.split(": live, ");
  const weekday = decision.firstDate ? formatLongDay(decision.firstDate).split(",")[0] : null;
  const phrase = LOOKS_WRONG_PHRASE[problem] ?? "but its hours look wrong";
  return `${name} is live${weekday ? ` on ${weekday}` : ""} ${phrase}.`;
}

/** "Saturday is four days away." for the lane's Saturday seen from today. */
export function whenSentence(saturday: string, today: string): string {
  const days = daysBetween(today, saturday);
  if (days > 1) return `Saturday is ${numberWord(days)} days away.`;
  if (days === 1) return "Saturday is tomorrow.";
  if (days === 0) return "Saturday is today.";
  return "Sunday is today.";
}

/** "1 of 22 is live.", "None of the 8 is live yet.", "All 13 are live." */
export function liveSentence(live: number, total: number): string {
  if (total === 0) return "Nothing is listed yet.";
  if (live === 0) return total === 1 ? "It is not live yet." : `None of the ${total} is live yet.`;
  if (live === total) return total === 1 ? "It is live." : `All ${total} are live.`;
  return `${live} of ${total} ${live === 1 ? "is" : "are"} live.`;
}

/** "Nothing is live yet in Spokane Valley, North Idaho or farther out.", when some of the lane is live. */
export function areaSentence(lane: TodoLane, live: number): string | null {
  if (live === 0) return null;
  const dark = lane.areas.filter((a) => a.total > 0 && a.live === 0).map((a) => (a.area === "Farther out" ? "farther out" : a.area));
  return dark.length ? `Nothing is live yet in ${listOr(dark)}.` : null;
}

/** The kinds the brief speaks about, in the order it speaks. */
const KIND_ORDER: DecisionKind[] = [
  "ready",
  "twins",
  "maybe-twins",
  "series",
  "trade-shows",
  "approved-unpublished",
  "single",
  "looks-wrong",
];

function group(decisions: Decision[], kind: DecisionKind) {
  return decisions.filter((d) => d.kind === kind);
}

function kindLines(kind: DecisionKind, list: Decision[]): BriefLine[] {
  const first = list[0];
  const n = list.length;
  switch (kind) {
    case "ready": {
      const count = first.rows.length;
      return [
        {
          text: `${count} ${count === 1 ? "is" : "are"} ready to publish.`,
          action: { kind: "publish-ready", decisionKey: first.key, label: first.primary.label },
        },
      ];
    }
    case "twins":
      return [
        n === 1
          ? { text: `${first.title.replace(/, (twice|\d+ times)$/, "")} is listed more than once.`, action: { kind: "goto", decisionKey: first.key, label: "Compare them" } }
          : { text: `${n} pairs look like the same event.`, action: { kind: "goto", decisionKey: first.key, label: `Start with ${shortName(first.title)}` } },
      ];
    case "maybe-twins":
      return [
        {
          text: n === 1 ? "One pair might be the same event." : `${n} pairs might be the same event.`,
          action: { kind: "goto", decisionKey: first.key, label: n === 1 ? "Compare them" : "Compare the first" },
        },
      ];
    case "series":
      return [
        {
          text:
            n === 1
              ? `A series starts here: ${seriesName(first.title)}.`
              : `${n} series start here: ${listAnd(list.map((d) => seriesName(d.title)))}.`,
          action: { kind: "goto", decisionKey: first.key, label: n === 1 ? "Open it" : "Open the first" },
        },
      ];
    case "trade-shows": {
      const rows = first.rows.length;
      const name = first.rows[0]?.title?.trim() ?? "One listing";
      return [
        {
          text: rows === 1 ? `${name} may not be a market.` : `${name} may not be a market, and ${rows - 1} more like it later in the season.`,
          action: { kind: "goto", decisionKey: first.key, label: rows === 1 ? "Review it" : `Review the ${rows}` },
        },
      ];
    }
    case "approved-unpublished":
      return list.map((d) => ({
        text: `${d.rows[0]?.title?.trim() ?? d.title} was approved but never published.`,
        action: { kind: "goto" as const, decisionKey: d.key, label: "Open it" },
      }));
    case "single":
      return [
        n === 1
          ? { text: `${first.title} needs a look before it can go live.`, action: { kind: "goto", decisionKey: first.key, label: "Open it" } }
          : { text: `${n} need a look before they can go live.`, action: { kind: "goto", decisionKey: first.key, label: "Open the first" } },
      ];
    case "looks-wrong":
      if (n > 2) {
        return [{ text: `${n} live events need a fix.`, action: { kind: "goto", decisionKey: first.key, label: "Open the first" } }];
      }
      return list.map((d) => ({ text: looksWrongSentence(d), action: { kind: "goto" as const, decisionKey: d.key, label: d.primary.label } }));
    default:
      return [];
  }
}

/** The next rail lane after `lane` that still has decisions. */
function nextBusyLane(lane: DecisionLane, lanes: TodoLane[], decisions: Decision[]): TodoLane | null {
  const rail = lanes.filter((l) => isRailLane(l.lane));
  const at = rail.findIndex((l) => l.lane === lane);
  return rail.slice(at + 1).find((l) => decisions.some((d) => d.lane === l.lane)) ?? null;
}

function briefTitle(lane: TodoLane, lanes: TodoLane[]): string {
  const weeks = lanes.filter((l) => isWeekLane(l.lane));
  const at = weeks.findIndex((l) => l.lane === lane.lane);
  const span = lane.span ?? lane.label;
  if (at === 0) return `This weekend, ${span}`;
  if (at === 1) return `Next weekend, ${span}`;
  const name = lane.saturday ? localDayName(lane.saturday) : null;
  return name ? `${name}, ${span}` : span;
}

/**
 * The weekend at a glance: a few plain sentences, each with at most one button, and the only
 * filled one publishes the ready batch. `counts` are the rail's live and total for the week.
 */
export function buildBrief({
  lane,
  lanes,
  decisions,
  today,
  now,
  counts,
}: {
  lane: TodoLane;
  lanes: TodoLane[];
  /** Every visible decision, all lanes, in pile order. */
  decisions: Decision[];
  today: string;
  now: Date;
  counts?: { live: number; total: number };
}): Brief {
  const title = briefTitle(lane, lanes);
  const saturday = lane.saturday ?? today;
  const live = counts?.live ?? lane.live;
  const total = counts?.total ?? lane.live + lane.waiting;
  const here = decisions.filter((d) => d.lane === lane.lane);
  const span = formatWeekendSpan(saturday, now);

  if (here.length === 0) {
    const next = nextBusyLane(lane.lane, lanes, decisions);
    const action: BriefAction | undefined = next
      ? { kind: "open-lane", lane: next.lane, label: `${next.label} (${next.waiting} waiting)` }
      : undefined;
    let text: string;
    if (live < total) {
      text = `No decisions left here for ${span}. ${liveSentence(live, total)} The rest wait in a decision on another weekend or under Later.`;
    } else if (total === 0 && lane.keptOff === 0) text = `Nothing is listed for ${span} yet.`;
    else text = `${span} is set: ${live} live${lane.keptOff ? `, ${lane.keptOff} kept off the site` : ""}.`;
    const lines: BriefLine[] = [{ text, action }];
    if (!next) lines.push({ text: "Nothing else waits on the coming weekends." });
    return { title, lines, footer: null, done: true };
  }

  const lines: BriefLine[] = [{ text: `${whenSentence(saturday, today)} ${liveSentence(live, total)}` }];
  const area = areaSentence(lane, live);
  if (area) lines.push({ text: area });
  for (const kind of KIND_ORDER) {
    const list = group(here, kind);
    if (list.length) lines.push(...kindLines(kind, list));
  }
  const others = here.filter((d) => !KIND_ORDER.includes(d.kind));
  if (others.length) {
    lines.push({
      text: others.length === 1 ? "One more decision waits here." : `${others.length} more decisions wait here.`,
      action: { kind: "goto", decisionKey: others[0].key, label: others.length === 1 ? "Open it" : "Open the first" },
    });
  }
  const waiting = lane.waiting;
  const footer =
    waiting > 0
      ? `${here.length} ${here.length === 1 ? "decision settles" : "decisions settle"} the ${waiting} waiting here.`
      : null;
  return { title, lines, footer, done: false };
}

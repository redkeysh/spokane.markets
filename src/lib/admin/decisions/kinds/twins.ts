import { formatDay } from "@/lib/admin/format";
import { hasImporterNote } from "@/lib/events/readiness";
import type { TwinPair } from "@/lib/events/twins";
import type { Decision, DecisionContext, DecisionEvent, DecisionKind } from "../types";
import { byStart, firstDateOf, publishLabel } from "./shared";

/** How much a record would give visitors; the fuller one of a pair is the one to keep. */
export function listingScore(event: DecisionEvent): number {
  const usefulDescription = !!event.description?.trim() && !hasImporterNote(event.description);
  const links = [event.websiteUrl, event.facebookUrl, event.instagramUrl].filter((l) => !!l?.trim()).length;
  return (event.imageUrl ? 2 : 0) + (usefulDescription ? 2 : 0) + event.tagCount + event.featureCount + links;
}

export function suggestKeep(a: DecisionEvent, b: DecisionEvent): DecisionEvent {
  const diff = listingScore(b) - listingScore(a);
  if (diff !== 0) return diff > 0 ? b : a;
  return b.createdAt < a.createdAt ? b : a;
}

export type TwinGroup = { ids: string[]; date: string };

/** Joins pairs that share an event into groups, so three copies of one event make one group. */
export function joinPairs(pairs: TwinPair[]): TwinGroup[] {
  const parent = new Map<string, string>();
  const rootOf = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const dateOf = new Map<string, string>();
  for (const pair of pairs) {
    for (const id of pair.ids) {
      if (!parent.has(id)) parent.set(id, id);
      dateOf.set(id, pair.date);
    }
    const [a, b] = pair.ids.map(rootOf);
    if (a !== b) parent.set(b, a);
  }
  const groups = new Map<string, TwinGroup>();
  for (const id of parent.keys()) {
    const root = rootOf(id);
    const group = groups.get(root) ?? { ids: [], date: dateOf.get(id)! };
    group.ids.push(id);
    groups.set(root, group);
  }
  return [...groups.values()];
}

function copies(count: number): string {
  return count === 2 ? "twice" : `${count} times`;
}

function titleList(titles: string[]): string {
  return titles.length <= 2 ? titles.join(" and ") : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/**
 * Turns pairs into one decision per group of events the pairs join, settling
 * the group's upcoming waiting events that no earlier kind took; a group with
 * none of those is skipped. A live copy, or else one an earlier kind took, is
 * the one to keep: the decision then archives the others as its duplicates
 * and leaves its status alone. Otherwise the fullest listing is suggested,
 * to keep and publish.
 */
export function pairDecisions(ctx: DecisionContext, pairs: TwinPair[], kind: DecisionKind): Decision[] {
  const open = new Set(ctx.unclaimedWaiting().filter((e) => !ctx.ended(e)).map((e) => e.id));
  const decisions: Decision[] = [];
  for (const group of joinPairs(pairs)) {
    const events = group.ids.map((id) => ctx.eventById.get(id)!).sort(byStart);
    const settled = events.filter((e) => open.has(e.id));
    if (settled.length === 0) continue;
    const fixed = events.find((e) => e.status === "PUBLISHED") ?? events.find((e) => !open.has(e.id));
    const keep = fixed ?? events.reduce(suggestKeep);
    const ids = events.map((e) => e.id).sort().join("|");
    const shared = {
      lane: ctx.laneOf(settled[0]),
      detail: `${formatDay(group.date, ctx.now)}, ${events[0].venue.name}`,
      rows: events.map((e) => ctx.row(e)),
      settles: settled.map((e) => e.id),
      firstDate: firstDateOf(ctx, settled),
      suggestedKeepId: keep.id,
    };
    if (kind !== "twins") {
      decisions.push({
        key: `${kind}:${ids}`,
        kind,
        title: `Maybe the same: ${titleList(events.map((e) => e.title.trim()))}`,
        primary: { label: "Compare", action: "compare" },
        ...shared,
      });
      continue;
    }
    const shortest = events.reduce((s, e) => (e.title.trim().length < s.title.trim().length ? e : s));
    const number = events.indexOf(keep) + 1;
    const notifies = fixed ? [] : ctx.notifies([keep]);
    decisions.push({
      key: `twins:${ids}`,
      kind,
      title: `${shortest.title.trim()}, ${copies(events.length)}`,
      primary: !fixed
        ? { label: publishLabel(`Keep ${number} and publish`, notifies), action: "keep-one", notifies }
        : { label: keep.status === "PUBLISHED" ? "Keep the live one" : `Keep ${number}`, action: "archive-duplicates" },
      ...shared,
    });
  }
  return decisions;
}

/** Same event more than once: same Pacific start date and place (or duplicate places), mostly the same title. */
export function find(ctx: DecisionContext): Decision[] {
  return pairDecisions(ctx, ctx.twins().twins, "twins");
}

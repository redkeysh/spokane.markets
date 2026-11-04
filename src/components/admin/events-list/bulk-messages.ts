/** Result wording for the Events list's bulk actions, for the toast and the live region. */

export type BulkVerb = "publish" | "reject" | "archive" | "restore" | "link" | "unlink" | "place" | "tag";

export type BulkCounts = {
  changed: string[];
  already: string[];
  failed: { id: string; reason: string }[];
  notified: string[];
};

/** The four fixed reasons; the fifth, Other, takes a note. Keys 1 to 5 pick them. */
export { REJECT_REASONS } from "@/lib/admin/reject-reasons";

function was(count: number): string {
  return count === 1 ? "was" : "were";
}

export function andList(words: string[]): string {
  if (words.length <= 2) return words.join(" and ");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const DONE: Record<BulkVerb, string> = {
  publish: "Published",
  reject: "Rejected",
  archive: "Archived",
  restore: "Restored",
  link: "Linked",
  unlink: "Took",
  place: "Moved",
  tag: "Tagged",
};

const NONE: Record<BulkVerb, string> = {
  publish: "Nothing was published.",
  reject: "Nothing was rejected.",
  archive: "Nothing was archived.",
  restore: "Nothing was restored.",
  link: "Nothing was linked.",
  unlink: "Nothing changed.",
  place: "Nothing was moved.",
  tag: "Nothing was tagged.",
};

function alreadyLine(verb: BulkVerb, count: number): string {
  switch (verb) {
    case "publish":
      return `${count} ${was(count)} already live.`;
    case "reject":
      return `${count} ${was(count)} already rejected.`;
    case "archive":
      return `${count} ${was(count)} already archived.`;
    case "restore":
      return `${count} ${was(count)} not archived.`;
    case "link":
      return `${count} ${was(count)} already in it.`;
    case "unlink":
      return `${count} had no market.`;
    case "place":
      return `${count} ${was(count)} already there.`;
    case "tag":
      return `${count} already had it.`;
  }
}

/**
 * "Published 3. 1 was already live.", "Linked Emerge Holiday Market to Kendall Yards Night Market.",
 * "Tagged 4 Holiday Market. 1 already had it." One event is named by its title.
 */
export function bulkMessage(
  verb: BulkVerb,
  counts: BulkCounts,
  context: { titleOf: (id: string) => string | undefined; target?: string }
): string {
  const n = counts.changed.length;
  const subject = n === 1 ? (context.titleOf(counts.changed[0]) ?? "1 event") : String(n);
  const parts: string[] = [];
  if (n === 0) parts.push(NONE[verb]);
  else if (verb === "link") parts.push(`Linked ${subject} to ${context.target ?? "the market"}.`);
  else if (verb === "unlink") parts.push(`Took ${subject} out of ${n === 1 ? "its" : "their"} market.`);
  else if (verb === "place") parts.push(`Moved ${subject} to ${context.target ?? "the place"}.`);
  else if (verb === "tag") parts.push(`Added ${context.target ?? "the tag"} to ${subject}.`);
  else parts.push(`${DONE[verb]} ${subject}.`);

  if (counts.already.length > 0) parts.push(alreadyLine(verb, counts.already.length));

  const failed = counts.failed.length;
  if (failed > 0) {
    const who = failed === 1 ? (context.titleOf(counts.failed[0].id) ?? "1 event") : String(failed);
    const first = counts.failed[0].reason.trim();
    if (verb === "publish") parts.push(`${who} ${failed === 1 ? "stays" : "stay"} off the site. ${first}`);
    else parts.push(`${who} could not be changed. ${first}`);
  }

  if (counts.notified.length > 0) parts.push(`${andList(counts.notified)} ${was(counts.notified.length)} told.`);
  return parts.join(" ");
}

export type RailWeekLike = {
  label: string;
  stalls: { id: string; status: string }[];
  live: number;
};

/** "Nov 7 is now 9 of 22 live." for the weeks a publish reached, at most two named. */
export function railAfterPublish(weeks: RailWeekLike[], publishedIds: string[]): string {
  const ids = new Set(publishedIds);
  const reached = weeks
    .map((week) => {
      const gained = week.stalls.filter((s) => ids.has(s.id) && s.status !== "PUBLISHED").length;
      return { week, gained };
    })
    .filter((w) => w.gained > 0);
  if (reached.length === 0) return "";
  const phrase = ({ week, gained }: (typeof reached)[number]) =>
    `${week.label} ${week.label === "Later" ? "has" : "is now"} ${week.live + gained} of ${week.stalls.length} live`;
  const named = reached.slice(0, 2).map(phrase);
  const more = reached.length - named.length;
  return `${named.join(", ")}${more > 0 ? `, and ${more} more ${more === 1 ? "weekend" : "weekends"} changed` : ""}.`;
}

/** "Reject 3", "Reject 3 and tell Dana", "Reject 3 and tell 2 organizers". */
export function tellLabel(base: string, tells: string[]): string {
  const names = [...new Set(tells)];
  if (names.length === 0) return base;
  if (names.length === 1) return `${base} and tell ${names[0].split(/\s+/)[0]}`;
  return `${base} and tell ${names.length} organizers`;
}

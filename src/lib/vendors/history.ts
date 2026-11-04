import type { HistoryListEntry } from "@/components/admin/kit/history-list";
import { addDays, formatMonthDay, pacificDate } from "@/lib/admin/format";
import type { HistoryEntry } from "@/lib/admin/history";
import { VERIFICATION_OPTIONS } from "./admin-input";

const longWeekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

/** "Today, Tuesday Nov 3", "Yesterday, Monday Nov 2", "Friday Oct 30". */
export function historyDayHeading(isoDate: string, now: Date = new Date()): string {
  const today = pacificDate(now);
  const day = `${longWeekday.format(new Date(`${isoDate}T12:00:00.000Z`))} ${formatMonthDay(isoDate, now)}`;
  if (isoDate === today) return `Today, ${day}`;
  if (isoDate === addDays(today, -1)) return `Yesterday, ${day}`;
  return day;
}

const FIELD_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["businessName", "Business name"],
  ["slug", "Web address"],
  ["verificationStatus", "Verification"],
  ["userId", "Claimed by"],
  ["deletedAt", "Archived"],
];

const VERIFICATION_WORDS: Record<string, string> = Object.fromEntries(VERIFICATION_OPTIONS.map((o) => [o.value, o.label]));

function words(key: string, value: unknown): string | null {
  if (key === "deletedAt") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return null;
  if (key === "verificationStatus") return VERIFICATION_WORDS[String(value)] ?? String(value);
  if (key === "userId") return "An account";
  return String(value);
}

/** The vendor fields an audit entry changed, in words; account ids are never shown. */
export function vendorHistoryDetails(
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): NonNullable<HistoryListEntry["details"]> {
  const out: { label: string; before: string | null; after: string | null }[] = [];
  for (const [key, label] of FIELD_LABELS) {
    const hasBefore = previousValue !== null && key in previousValue;
    const hasAfter = newValue !== null && key in newValue;
    if (!hasBefore && !hasAfter) continue;
    const beforeRaw = previousValue?.[key] ?? null;
    const afterRaw = newValue?.[key] ?? null;
    if (hasBefore && hasAfter && JSON.stringify(beforeRaw) === JSON.stringify(afterRaw)) continue;
    const before = hasBefore ? words(key, beforeRaw) : null;
    let after = hasAfter ? words(key, afterRaw) : null;
    if (key === "userId" && beforeRaw && afterRaw) after = "A different account";
    out.push({ label, before, after });
  }
  return out;
}

/** History entries of one vendor, shaped for the kit's HistoryList. */
export function toVendorHistory(entries: readonly HistoryEntry[], now: Date = new Date()): HistoryListEntry[] {
  return entries.map((entry) => ({
    id: entry.id,
    day: historyDayHeading(pacificDate(entry.at), now),
    at: entry.at.toISOString(),
    time: entry.time,
    timestamp: entry.timestamp,
    sentence: entry.sentence,
    details: vendorHistoryDetails(entry.previousValue, entry.newValue),
  }));
}

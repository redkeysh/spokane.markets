/** Counts and short lists in plain words for the rare screens. */

/** "1 event", "3 events". */
export function countWord(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Used by 3 vendors and 1 market", or "Not used yet". */
export function badgeUse(vendors: number, markets: number): string {
  if (vendors === 0 && markets === 0) return "Not used yet";
  const parts = [
    vendors > 0 ? countWord(vendors, "vendor", "vendors") : null,
    markets > 0 ? countWord(markets, "market", "markets") : null,
  ];
  return `Used by ${parts.filter(Boolean).join(" and ")}`;
}

/** "Every area", "Downtown, Hillyard", "Downtown, Hillyard, Perry and 2 more". */
export function areaWords(areas: readonly string[], labels: ReadonlyMap<string, string>): string {
  if (areas.length === 0) return "Every area";
  const names = areas.map((a) => labels.get(a) ?? a);
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
}

/** "A, B and C": a list joined the way a sentence would. */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

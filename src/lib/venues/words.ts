/** "1 place", "3 places". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 events and 1 market", "1 event", or "nothing". */
export function usesText(uses: { events: number; markets: number }): string {
  const parts = [uses.events ? plural(uses.events, "event") : null, uses.markets ? plural(uses.markets, "market") : null].filter(Boolean);
  return parts.length ? parts.join(" and ") : "nothing";
}

/** "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Every item up to `max` ("a, b and c"); past that, the first ones and a count ("a, b and 2 more"). */
export function listSome(items: readonly string[], max = 3): string {
  if (items.length <= max) return listWords(items);
  return `${items.slice(0, max - 1).join(", ")} and ${items.length - (max - 1)} more`;
}

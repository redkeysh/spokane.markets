/**
 * The comparable core of an event title: lowercase, straight quotes, no
 * years, no "annual", "the" or ordinals ("11th"), and no trailing "(Host)".
 * Apostrophes are dropped and other punctuation becomes a space, so
 * "Northwest's Premier Bridal Festival" gives "northwests premier bridal festival".
 */
export function coreTitle(title: string): string {
  return title
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .trim()
    .replace(/\s*\([^()]*\)\s*$/, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !DROPPED_WORDS.has(word) && !/^(19|20)\d{2}$/.test(word) && !/^\d+(st|nd|rd|th)$/.test(word))
    .join(" ");
}

const DROPPED_WORDS = new Set(["annual", "the"]);

/** Words that carry no meaning when two titles are compared. */
const STOP_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "with"]);

/** The distinct meaningful words of a title's core. */
export function titleWords(title: string): Set<string> {
  return new Set(
    coreTitle(title)
      .split(" ")
      .filter((word) => word !== "" && !STOP_WORDS.has(word))
  );
}

/** Shared words as a share of the shorter title's words, from 0 to 1. */
export function titleOverlap(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (small.size === 0) return 0;
  let shared = 0;
  for (const word of small) if (large.has(word)) shared += 1;
  return shared / small.size;
}

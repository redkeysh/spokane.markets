/**
 * Titles that read like a trade or consumer show rather than a market or
 * fair, matched as whole words, case-insensitive. This list decides what the
 * "might not be a market" batch collects.
 */
export const TRADE_SHOW_KEYWORDS = [
  "bridal",
  "home and yard",
  "home & yard",
  "golf",
  "boat show",
  "RV",
  "expo",
  "ATV",
  "ski swap",
  "card show",
  "CardCon",
  "trading card",
] as const;

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TRADE_SHOW_PATTERN = new RegExp(
  `(^|[^a-z0-9])(${TRADE_SHOW_KEYWORDS.map((k) => escape(k.toLowerCase())).join("|")})(?![a-z0-9])`
);

export function looksLikeTradeShow(title: string): boolean {
  return TRADE_SHOW_PATTERN.test(title.toLowerCase());
}

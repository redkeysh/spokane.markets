/** Plain words for items sent from the public site. Pure. */

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "4 of 5 stars" */
export function starsText(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return `${n} of 5 ${n === 1 ? "star" : "stars"}`;
}

const REPORT_REASONS: Record<string, string> = {
  spam: "Spam",
  scam_or_fraud: "Scam or fraud",
  inappropriate: "Inappropriate",
  duplicate_listing: "Duplicate listing",
  other: "Other",
};

/** "Scam or fraud"; an unknown reason is shown as typed, a missing one as "No reason given". */
export function reportReasonText(reason: string | null | undefined): string {
  const key = reason?.trim();
  if (!key) return "No reason given";
  return REPORT_REASONS[key] ?? key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const SEVERITY_WORDS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
export const ESCALATION_WORDS: Record<string, string> = { NEW: "New", TRIAGED: "Looked at", ESCALATED: "Escalated", CLOSED: "Closed" };

export const APPLICATION_FORM_WORDS: Record<string, string> = {
  VENDOR: "Vendor application",
  MARKET: "Market application",
  VENDOR_VERIFICATION: "Vendor verification",
};

/** "Dana wants to sell as a vendor", "Dana wants to list a market", "Dana asked to be verified". */
export function applicationTitle(name: string, formType: string): string {
  const who = name.trim() || "Someone";
  if (formType === "VENDOR") return `${who} wants to sell as a vendor`;
  if (formType === "MARKET") return `${who} wants to list a market`;
  if (formType === "VENDOR_VERIFICATION") return `${who} asked to be verified`;
  return `${who} sent an application`;
}

/** What approving an application does to the applicant's account, or null when it changes nothing. */
export function approvalConsequence(formType: string, hasAccount: boolean): string | null {
  if (!hasAccount) return null;
  if (formType === "VENDOR") return "Approving makes their account a vendor account.";
  if (formType === "MARKET") return "Approving makes their account an organizer account.";
  if (formType === "VENDOR_VERIFICATION") return "Approving marks their vendor profile as verified.";
  return null;
}

const VENDOR_TYPES: Record<string, string> = {
  "handmade-craft": "Handmade or craft",
  "food-beverage": "Food or drink",
  "farm-produce": "Farm or produce",
  "vintage-resale": "Vintage or resale",
  "art-photography": "Art or photography",
  services: "Services",
  other: "Other",
};

const LEAD_TIMES: Record<string, string> = {
  "1-week": "1 week",
  "2-weeks": "2 weeks",
  "1-month": "1 month",
  "2-plus-months": "2 months or more",
};

const WILLINGNESS: Record<string, string> = {
  "not-willing": "Would not pay",
  "5-10": "$5 to $10 a month",
  "10-25": "$10 to $25 a month",
  "25-50": "$25 to $50 a month",
  "50-plus": "$50 a month or more",
};

function lookup(table: Record<string, string>, value: string | null | undefined): string {
  const key = value?.trim();
  if (!key) return "Not answered";
  return table[key] ?? key;
}

export const vendorTypeText = (value: string | null | undefined) => lookup(VENDOR_TYPES, value);
export const leadTimeText = (value: string | null | undefined) => lookup(LEAD_TIMES, value);
export const willingnessText = (value: string | null | undefined) => lookup(WILLINGNESS, value);

/** A one-line excerpt for list rows: collapsed whitespace, cut at a word near `max` characters. */
export function excerpt(text: string | null | undefined, max = 140): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** An account's display name: its name, else the part of the email before the @. */
export function personName(user: { name: string | null; email: string } | null | undefined, fallback = "Someone"): string {
  if (!user) return fallback;
  return user.name?.trim() || user.email.split("@")[0] || fallback;
}

const STATUS_NOUNS: Record<string, [string, string]> = {
  review: ["review", "reviews"],
  photo: ["photo", "photos"],
  report: ["report", "reports"],
  message: ["message", "messages"],
};

const STATUS_DONE: Record<string, Record<string, (what: string) => string>> = {
  review: { APPROVED: (w) => `Approved ${w}.`, REJECTED: (w) => `Rejected ${w}.` },
  photo: { APPROVED: (w) => `Showing ${w} on the site.`, REJECTED: (w) => `Rejected ${w}.` },
  report: { RESOLVED: (w) => `Resolved ${w}.`, DISMISSED: (w) => `Dismissed ${w}.` },
  message: { PENDING: (w) => `Marked ${w} as unread.`, READ: (w) => `Marked ${w} as read.`, ARCHIVED: (w) => `Archived ${w}.` },
};

const STATUS_ALREADY: Record<string, Record<string, string>> = {
  review: { APPROVED: "approved", REJECTED: "rejected" },
  photo: { APPROVED: "showing", REJECTED: "rejected" },
  report: { RESOLVED: "resolved", DISMISSED: "dismissed" },
  message: { PENDING: "unread", READ: "read", ARCHIVED: "archived" },
};

/** "Approved 3 reviews. 1 was already approved." */
export function statusMessage(kind: string, to: string, changed: number, already: number, missing: number): string {
  const [one, many] = STATUS_NOUNS[kind] ?? ["item", "items"];
  const parts = [changed > 0 ? (STATUS_DONE[kind]?.[to]?.(plural(changed, one, many)) ?? "Done.") : "Nothing changed."];
  if (already > 0) parts.push(`${plural(already, "was", "were")} already ${STATUS_ALREADY[kind]?.[to] ?? "done"}.`);
  if (missing > 0) parts.push(`${plural(missing, "is", "are")} gone.`);
  return parts.join(" ");
}

/** "Approved Dana's application. Their account is now a vendor account. Dana was told." */
export function applicationMessage(
  status: string,
  name: string,
  effects: { role?: string | null; verification?: string | null; told?: string | null } = {}
): string {
  const done: Record<string, string> = {
    APPROVED: `Approved ${name}'s application.`,
    REJECTED: `Rejected ${name}'s application.`,
    NEEDS_INFO: `Asked ${name} for more information.`,
    DUPLICATE: `Marked ${name}'s application as a duplicate.`,
  };
  const parts = [done[status] ?? `Updated ${name}'s application.`];
  if (effects.role) parts.push(`Their account is now ${effects.role === "VENDOR" ? "a vendor" : "an organizer"} account.`);
  if (effects.verification) parts.push(`Their vendor profile is now ${effects.verification === "VERIFIED" ? "verified" : "not verified"}.`);
  if (effects.told) parts.push(`${effects.told.trim().split(/\s+/)[0]} was told.`);
  return parts.join(" ");
}

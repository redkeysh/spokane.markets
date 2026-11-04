/** Application answers in words, and the new market an approved market application prefills. Pure. */

export type FormField = { id: string; label: string };

/** Each answered field as label and text, in the form's order, then answers to fields it no longer has. */
export function answerLines(fields: unknown, answers: unknown): { label: string; value: string }[] {
  const list = Array.isArray(fields)
    ? fields.filter((f): f is FormField => !!f && typeof f === "object" && typeof (f as FormField).id === "string")
    : [];
  const values = answers && typeof answers === "object" && !Array.isArray(answers) ? (answers as Record<string, unknown>) : {};
  const text = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(text).filter(Boolean).join(", ");
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === null || value === undefined) return "";
    return String(value).trim();
  };
  const lines: { label: string; value: string }[] = [];
  const seen = new Set<string>();
  for (const field of list) {
    seen.add(field.id);
    const value = text(values[field.id]);
    if (value) lines.push({ label: field.label?.trim() || field.id, value });
  }
  for (const [id, raw] of Object.entries(values)) {
    if (seen.has(id)) continue;
    const value = text(raw);
    if (value) lines.push({ label: id, value });
  }
  return lines;
}

/** `skip` rules out labels that match `pattern` but ask something else ("Instagram link"). */
const PREFILL: { key: string; pattern: RegExp; skip?: RegExp; max: number }[] = [
  { key: "name", pattern: /\b(market|event|business)\s*name\b|\bname of (the |your )?(market|event)\b/i, max: 200 },
  { key: "websiteUrl", pattern: /\b(website|web site|url)\b/i, skip: /\b(facebook|instagram)\b/i, max: 500 },
  { key: "contactPhone", pattern: /\bphone\b/i, max: 50 },
  { key: "contactEmail", pattern: /\be-?mail\b/i, max: 200 },
  { key: "typicalSchedule", pattern: /\b(schedule|days|hours|season)\b|\bwhen (is|does|do)\b/i, max: 200 },
  { key: "description", pattern: /\b(describe|description)\b|\babout (the|your) (market|event)\b/i, max: 5000 },
];

/**
 * /admin/markets/new prefilled from a market application: the answers whose labels name the
 * market, its website, phone, email, schedule or description, the applicant's email when no answer
 * gives one, and the applicant's account as owner.
 */
export function createMarketHref(answers: { label: string; value: string }[], applicant: { email: string; userId: string | null }): string {
  const q = new URLSearchParams();
  for (const { key, pattern, skip, max } of PREFILL) {
    const answer = answers.find((a) => pattern.test(a.label) && !skip?.test(a.label) && a.value.trim());
    if (answer) q.set(key, answer.value.trim().slice(0, max));
  }
  if (!q.has("contactEmail") && applicant.email.trim()) q.set("contactEmail", applicant.email.trim());
  if (applicant.userId) q.set("ownerId", applicant.userId);
  const s = q.toString();
  return s ? `/admin/markets/new?${s}` : "/admin/markets/new";
}

/**
 * Facts found in an event description (free admission, prices, vendor
 * applications, importer leaks, day and hour phrases), offered to the owner
 * as suggestions and never written on their own. Pure; safe in the browser.
 */
import { IMPORTER_NOTE_PATTERNS } from "./readiness";

export type DescriptionFact =
  | { kind: "free-admission"; text: string }
  | { kind: "admission-price"; text: string }
  | { kind: "vendor-applications"; state: "open" | "closed"; text: string }
  | { kind: "booth-fee"; text: string }
  | { kind: "application-deadline"; date: string | null; text: string }
  | { kind: "importer-note"; sentence: string }
  | { kind: "hours"; days: { date: string | null; weekday: string | null; startTime: string; endTime: string }[]; text: string };

export type HoursDay = Extract<DescriptionFact, { kind: "hours" }>["days"][number];

export type FindFactsOptions = {
  /**
   * The year the event happens in. Dates written without a year ("Dec 1") and named days
   * ("Black Friday") resolve only with it.
   */
  year?: number;
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "October 18, 2026", "Dec 1", "Nov. 20th". */
const MONTH_DAY =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?";

const WEEKDAY_WORD =
  "(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?\\.?";
const NAMED_DAY = "(?:black friday|small business saturday|thanksgiving(?: day)?)";

/** One clock time: "10am", "10:30 a.m.", "4 pm", "noon", "16:00". */
const TIME = "(?:noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?\\s?m\\.?)?)";
/** En dash and em dash, built from code points so the source holds no dash characters. */
const DASHES = String.fromCharCode(0x2013, 0x2014);
const DASH = `[-${DASHES}]`;
const OPEN_QUOTE = String.fromCharCode(0x201c);
const ZERO_WIDTH_SPACE = new RegExp(String.fromCharCode(0x200b), "g");
const RANGE = new RegExp(`(${TIME})\\s*(?:${DASH}|\\bto\\b|\\buntil\\b|\\btill\\b)\\s*(${TIME})`, "gi");
/** Words that make a time range about vendors arriving or leaving, not about the public's hours. */
const SETUP_WORDS = /\b(?:set ?up|load[- ]?in|load[- ]?out|check[- ]in|tear ?down)\b/i;
/** A range labeled as setup right after it: "4pm-8pm for vendor setup", "7-9am (load-in)". */
const SETUP_AFTER = new RegExp(`^\\s*\\(?\\s*(?:for\\s+)?(?:vendors?\\s+)?${SETUP_WORDS.source}`, "i");
/** The days or dates that end the text before a time range ("Friday, ", "December 4 and "), so the clause before them can be read. */
const DAYS_AT_END = new RegExp(
  `(?:${MONTH_DAY}|${NAMED_DAY}|\\b${WEEKDAY_WORD})(?:[\\s,:&]|\\b(?:and|through|thru|to|on|from|each|every)\\b|${DASH}|${MONTH_DAY}|${NAMED_DAY}|\\b${WEEKDAY_WORD})*$`,
  "i"
);

const ABBREVIATIONS = new Set(["mt", "st", "dr", "ave", "rd", "blvd", "no", "inc", "co", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "a.m", "p.m", "am", "pm"]);

/** Lines, then sentences: each keeps its closing punctuation. Abbreviations ("St.", "a.m.") do not end one. */
export function sentencesOf(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    let start = 0;
    const boundary = new RegExp(`[.!?]+(?=\\s+["'(${OPEN_QUOTE}$A-Z0-9])`, "g");
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(line))) {
      const before = line.slice(start, match.index).split(/\s+/).pop()?.toLowerCase().replace(/^\W+/, "") ?? "";
      if (ABBREVIATIONS.has(before) || /^[a-z]$/i.test(before)) continue;
      const end = match.index + match[0].length;
      out.push(line.slice(start, end).trim());
      start = end;
    }
    const rest = line.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out.filter((s) => /[a-z0-9]/i.test(s));
}

function trimEnd(text: string): string {
  return text.trim().replace(/[\s.,;:!]+$/, "");
}

function capitalize(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function iso(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

/** "October 18, 2026" to "2026-10-18"; without a year in the text, `year` is used, else null. */
export function parseMonthDay(text: string, year?: number): string | null {
  const m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i.exec(text.trim());
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const y = m[3] ? Number(m[3]) : year;
  if (!month || !y) return null;
  return iso(y, month, Number(m[2]));
}

/** Thanksgiving is the fourth Thursday of November; Black Friday and Small Business Saturday follow it. */
export function namedDayDate(name: string, year: number): string {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  const offset = /black friday/i.test(name) ? 1 : /saturday/i.test(name) ? 2 : 0;
  return iso(year, 11, thursday + offset)!;
}

function weekdayIndexOf(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, "").replace(/s$/, "");
  const prefixes = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const index = prefixes.findIndex((p) => w.startsWith(p));
  return index === -1 ? null : index;
}

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * "10am" to "10:00", "4:30 p.m." to "16:30"; `meridiem` fills in a missing am or pm. Without
 * either, only a 24-hour time ("16:00", or any time when `twentyFour`) is read.
 */
function clock(raw: string, meridiem: "am" | "pm" | null, twentyFour = false): string | null {
  const text = raw.trim().toLowerCase();
  if (text === "noon") return "12:00";
  if (text === "midnight") return "23:59";
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s?m\.?)?$/.exec(text);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59 || hour > 23) return null;
  const own = m[3] ? (m[3] === "a" ? "am" : "pm") : null;
  const mer = own ?? meridiem;
  if (hour > 12) return own ? null : hhmm(hour, minute);
  if (!own && twentyFour) return hhmm(hour, minute);
  if (!mer || hour === 0) return null;
  if (mer === "pm" && hour !== 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  return hhmm(hour, minute);
}

function meridiemOf(raw: string): "am" | "pm" | null {
  const m = /([ap])\.?\s?m\.?\s*$/i.exec(raw.trim());
  if (m) return m[1].toLowerCase() === "a" ? "am" : "pm";
  if (/noon|midnight/i.test(raw)) return "pm";
  return null;
}

/** A time range as 24-hour times, or null when it cannot be read with confidence. */
export function parseRange(startRaw: string, endRaw: string): { startTime: string; endTime: string } | null {
  const startMer = meridiemOf(startRaw);
  const endMer = meridiemOf(endRaw);
  const twentyFour = /:\d{2}/.test(startRaw) && /:\d{2}/.test(endRaw) && !startMer && !endMer;
  if (!startMer && !endMer && !twentyFour) return null;
  let end = clock(endRaw, endMer ?? startMer, twentyFour);
  let start = clock(startRaw, startMer ?? endMer, twentyFour);
  if (!start || !end) return null;
  if (!startMer && endMer && start >= end) start = clock(startRaw, "am");
  if (start && startMer && !endMer && end <= start) end = clock(endRaw, "pm");
  if (!start || !end || start >= end) return null;
  return { startTime: start, endTime: end };
}

const DAY_TOKEN = new RegExp(`^(?:${NAMED_DAY}|${WEEKDAY_WORD})$`, "i");
const FILLER = /^(?:are|is|run|runs|open|opens|from|hours|on|each|every|and|,|:)$/i;
const CONNECTOR = new RegExp(`^(?:,|&|and|through|thru|to|${DASH})$`, "i");
const RANGE_CONNECTOR = new RegExp(`^(?:through|thru|to|${DASH})$`, "i");
const SPLIT_PUNCTUATION = new RegExp(`([,&${DASHES}-])`, "g");

type DayRef = { weekday: number; named: string | null };

/** The day list that ends `text` ("open Friday and Saturday", "Fri-Sun", "November Saturdays run"), or []. */
function trailingDays(text: string): DayRef[] {
  const tokens = text
    .replace(SPLIT_PUNCTUATION, " $1 ")
    .replace(/\b(black friday|small business saturday|thanksgiving day)\b/gi, (m) => m.replace(/ /g, "_"))
    .split(/\s+/)
    .filter(Boolean);
  let i = tokens.length - 1;
  while (i >= 0 && FILLER.test(tokens[i]) && !DAY_TOKEN.test(tokens[i])) i -= 1;
  const picked: { token: string; rangeBefore: boolean }[] = [];
  let pendingRange = false;
  while (i >= 0) {
    const token = tokens[i].replace(/_/g, " ");
    if (DAY_TOKEN.test(token)) {
      picked.unshift({ token, rangeBefore: false });
      if (pendingRange && picked.length > 1) picked[1].rangeBefore = true;
      pendingRange = false;
      i -= 1;
      continue;
    }
    if (picked.length > 0 && CONNECTOR.test(token)) {
      pendingRange = RANGE_CONNECTOR.test(token);
      i -= 1;
      continue;
    }
    break;
  }
  const days: DayRef[] = [];
  for (const { token, rangeBefore } of picked) {
    const named = new RegExp(`^${NAMED_DAY}$`, "i").test(token) ? token.toLowerCase() : null;
    const weekday = named ? (/friday/.test(named) ? 4 : /saturday/.test(named) ? 5 : 3) : weekdayIndexOf(token);
    if (weekday === null) continue;
    const previous = days[days.length - 1];
    if (rangeBefore && previous && !previous.named && !named) {
      for (let d = (previous.weekday + 1) % 7; d !== weekday; d = (d + 1) % 7) days.push({ weekday: d, named: null });
    }
    days.push({ weekday, named });
  }
  return days;
}

/** The day list that starts `text` ("Saturday and Sunday", "on Fridays"), for "10am-4pm Saturday and Sunday". */
function leadingDays(text: string): DayRef[] {
  const m = new RegExp(`^\\s*(?:on |each |every )?((?:${WEEKDAY_WORD})(?:\\s*(?:,|&|and|through|thru|to|${DASH})\\s*(?:${WEEKDAY_WORD}))*)`, "i").exec(text);
  return m ? trailingDays(m[1]) : [];
}

/** "Friday and Saturday", "Black Friday", "Friday, Saturday and Sunday". */
function dayWords(refs: DayRef[]): string {
  const words = refs.map((r) => (r.named ? capitalize(r.named.replace(/\b\w/g, (c) => c.toUpperCase())) : WEEKDAY_NAMES[r.weekday]));
  return words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function dayEntry(ref: DayRef, range: { startTime: string; endTime: string }, year?: number): HoursDay | null {
  if (ref.named) {
    if (!year) return null;
    return { date: namedDayDate(ref.named, year), weekday: WEEKDAY_NAMES[ref.weekday], ...range };
  }
  return { date: null, weekday: WEEKDAY_NAMES[ref.weekday], ...range };
}

/** Day and hour phrases, read sentence by sentence. Nothing is guessed: a phrase without days or with an unclear time is skipped. */
function findHours(sentences: string[], year?: number): { days: HoursDay[]; phrases: string[] } {
  const days: HoursDay[] = [];
  const phrases: string[] = [];
  const add = (entry: HoursDay | null) => {
    if (!entry) return;
    const same = days.findIndex((d) => d.date === entry.date && d.weekday === entry.weekday);
    if (same === -1) days.push(entry);
  };

  for (const sentence of sentences) {
    let last = 0;
    RANGE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RANGE.exec(sentence))) {
      const range = parseRange(match[1], match[2]);
      const before = sentence.slice(last, match.index);
      last = match.index + match[0].length;
      if (!range) continue;
      const lead = before.replace(DAYS_AT_END, "").split(/[,;]/).pop() ?? "";
      const tail = sentence.slice(last).split(/[,;.]/)[0];
      if (SETUP_WORDS.test(lead) || SETUP_AFTER.test(tail)) continue;
      const dated = new RegExp(`(${MONTH_DAY})(?:\\s*(?:,|&|and)\\s*(\\d{1,2})(?!\\d))?[\\s,:]*(?:from\\s+)?$`, "i").exec(before);
      let refs = trailingDays(before);
      if (refs.length === 0 && /\b(?:daily|every day|each day)\b[\s,:]*(?:from\s+)?$/i.test(before)) {
        refs = WEEKDAY_NAMES.map((_, weekday) => ({ weekday, named: null }));
      }
      if (refs.length === 0 && !dated) {
        const after = leadingDays(sentence.slice(last));
        if (after.length) refs = after;
      }
      if (refs.length === 0 && dated) {
        const first = parseMonthDay(dated[1], year);
        if (!first) continue;
        const dates = [first];
        if (dated[2]) {
          const second = `${first.slice(0, 8)}${dated[2].padStart(2, "0")}`;
          if (iso(Number(second.slice(0, 4)), Number(second.slice(5, 7)), Number(second.slice(8))) === second) dates.push(second);
        }
        for (const date of dates) {
          const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
          add({ date, weekday: WEEKDAY_NAMES[weekday], ...range });
        }
        phrases.push(trimEnd(`${dated[0]}${match[0]}`));
        continue;
      }
      if (refs.length === 0) continue;
      for (const ref of refs) add(dayEntry(ref, range, year));
      phrases.push(`${dayWords(refs)} ${trimEnd(match[0])}`);
    }

    const opens = new RegExp(`(${NAMED_DAY}|${WEEKDAY_WORD})\\s+(?:opens|open|opening|starts?)\\s+(?:at\\s+)?(${TIME})`, "gi");
    while ((match = opens.exec(sentence))) {
      const [ref] = trailingDays(match[1]);
      const start = clock(match[2], meridiemOf(match[2]));
      if (!ref || !start) continue;
      const sameDay = days.find((d) => d.weekday === WEEKDAY_NAMES[ref.weekday] && !d.date);
      if (!sameDay || start >= sameDay.endTime) continue;
      const entry = dayEntry(ref, { startTime: start, endTime: sameDay.endTime }, year);
      if (!entry) continue;
      if (entry.date) {
        days.unshift(entry);
      } else {
        sameDay.startTime = start;
      }
      phrases.push(trimEnd(match[0]));
    }
  }
  return { days, phrases };
}

const FREE_ADMISSION = [
  /\bfree admission\b/i,
  /\badmission (?:and parking )?(?:is |are )?(?:always )?free\b/i,
  /\bfree (?:and open )?to (?:the public|all|everyone)\b/i,
  /\bfree (?:entry|to attend)\b/i,
  /\bno (?:admission|entry) (?:fee|charge|cost)\b(?![^.]*\bstated\b)/i,
];

const PRICE_WORDS = /\b(?:admission|entry|entrance|tickets?|cover charge)\b/i;
const BOOTH_WORDS = /\b(?:booths?|vendor (?:fees?|spaces?|spots?))\b/i;
const MONEY = /\$\s?\d/;

const VENDOR_OPEN = [
  /\bvendor (?:and [a-z ]+? )?applications? (?:are |is )?(?:now )?open\b/i,
  /\b(?:vendor )?applications? (?:are |is )?(?:now )?(?:being )?accepted\b/i,
  /(?<!\b(?:not|no longer|not currently|stopped)\s)\b(?:now )?accepting (?:new )?(?:vendor applications|vendors)\b/i,
  /\bvendor applications? (?:are |is )?(?:now )?available\b/i,
];
const VENDOR_CLOSED = [
  /\bvendor (?:and [a-z ]+? )?applications? (?:are |is |have )?(?:now )?closed\b/i,
  /\b(?:additional |new |more )?vendors (?:are )?not being accepted\b/i,
  /\bnot accepting (?:new |additional |more )?(?:vendors|vendor applications|applications)\b/i,
  /\b(?:no longer|not currently|stopped) accepting (?:new |additional |more )?(?:vendors|vendor applications|applications)\b/i,
  /\b(?:vendor )?applications? (?:are |is )?(?:no longer|not) (?:being )?accepted\b/i,
  /\b(?:vendor )?(?:booths?|spaces?) (?:are |is )?(?:sold out|full)\b/i,
];

/** "Free admission for kids under 12" is free for some, not for everyone. */
const FREE_FOR_SOME = /^\s*(?:is\s+)?for\s+(?:kids|children|students|seniors|ages|under)\b/i;

const LEAKS = [...IMPORTER_NOTE_PATTERNS, /\bno (?:admission|entry) (?:charge|fee|price) is stated\b/i];

const DEADLINE = [
  new RegExp(`\\bdeadline(?: (?:was listed as|is|was|of))?:?\\s+(${MONTH_DAY})`, "i"),
  new RegExp(`\\b(?:applications?|fees?|payment)s? (?:are |is )?due (?:by |on )?(${MONTH_DAY})`, "i"),
  new RegExp(`\\bapply by (${MONTH_DAY})`, "i"),
  new RegExp(`\\bapplications? close[sd]? (?:on )?(${MONTH_DAY})`, "i"),
  new RegExp(`\\bdue (?:by |on )?(${MONTH_DAY})`, "i"),
];

function firstMatch(text: string, patterns: RegExp[]): RegExpExecArray | null {
  let best: RegExpExecArray | null = null;
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m && (!best || m.index < best.index)) best = m;
  }
  return best;
}

/**
 * The first free admission phrase that means free for everyone: not one followed by "for kids"
 * and the like, and not one in a sentence that also gives an admission price.
 */
function freeAdmission(sentences: string[]): RegExpExecArray | null {
  for (const sentence of sentences) {
    const m = firstMatch(sentence, FREE_ADMISSION);
    if (!m) continue;
    if (FREE_FOR_SOME.test(sentence.slice(m.index + m[0].length))) continue;
    if (sentence.split(/;\s*/).some((clause) => MONEY.test(clause) && !BOOTH_WORDS.test(clause))) continue;
    return m;
  }
  return null;
}

/** "Admission $10; children 12 and under free." gives "$10; children 12 and under free". */
function priceText(sentence: string): string {
  return trimEnd(sentence.replace(/^(?:general )?admission(?:\s+is|\s+costs?|:)?\s+(?=\$)/i, ""));
}

/** "booths are $50 per day and are reviewed weekly" gives "$50 per day"; "10x10 booth $50, due November 20" gives "10x10 booth $50". */
function boothText(clause: string): string {
  const cut = clause.split(/,?\s+(?:due|no deadline|and (?:are|is) reviewed|with fees? due)\b/i)[0];
  return trimEnd(cut.trim().replace(/^(?:the )?booths? (?:are|is|cost|costs|run|runs)\s+/i, ""));
}

/**
 * What a description states that the listing's own fields could carry, in the order the editor
 * offers them: free admission, the admission price, whether vendor applications are open or
 * closed, the booth fee and the deadline, sentences an import left behind, and daily hours.
 * Proposals only: the owner confirms each one.
 */
export function findFacts(description: string | null | undefined, options: FindFactsOptions = {}): DescriptionFact[] {
  const text = description?.replace(ZERO_WIDTH_SPACE, "").trim();
  if (!text) return [];
  const sentences = sentencesOf(text);
  const facts: DescriptionFact[] = [];

  const free = freeAdmission(sentences);
  if (free) facts.push({ kind: "free-admission", text: capitalize(free[0]) });

  const prices = new Set<string>();
  for (const sentence of sentences) {
    if (!MONEY.test(sentence) || !PRICE_WORDS.test(sentence)) continue;
    const priced = sentence.split(/;\s*/).some((clause) => MONEY.test(clause) && !BOOTH_WORDS.test(clause));
    if (!priced || BOOTH_WORDS.test(sentence.split(/;\s*/).find((c) => PRICE_WORDS.test(c)) ?? "")) continue;
    prices.add(priceText(sentence));
  }
  for (const price of prices) facts.push({ kind: "admission-price", text: price });

  const open = firstMatch(text, VENDOR_OPEN);
  const closed = firstMatch(text, VENDOR_CLOSED);
  const vendor = open && (!closed || open.index < closed.index) ? { state: "open" as const, m: open } : closed ? { state: "closed" as const, m: closed } : null;
  if (vendor) facts.push({ kind: "vendor-applications", state: vendor.state, text: capitalize(vendor.m[0]) });

  const booth = sentences.flatMap((s) => s.split(/;\s*/)).find((clause) => BOOTH_WORDS.test(clause) && MONEY.test(clause));
  if (booth) facts.push({ kind: "booth-fee", text: boothText(booth) });

  for (const sentence of sentences) {
    const vendorTalk = /\b(?:vendors?|booths?|applications?|deadline)\b/i.test(sentence);
    const m = vendorTalk ? firstMatch(sentence, DEADLINE) : null;
    if (!m) continue;
    facts.push({ kind: "application-deadline", date: parseMonthDay(m[1], options.year), text: m[1].trim() });
    break;
  }

  for (const sentence of sentences) {
    if (LEAKS.some((pattern) => pattern.test(sentence))) facts.push({ kind: "importer-note", sentence });
  }

  const hours = findHours(sentences, options.year);
  if (hours.days.length > 0) facts.push({ kind: "hours", days: hours.days, text: hours.phrases.join("; ") });

  return facts;
}

/** The hours a description states, flattened, for proposing daily hours. */
export function statedHours(description: string | null | undefined, options: FindFactsOptions = {}): HoursDay[] {
  return findFacts(description, options).flatMap((f) => (f.kind === "hours" ? f.days : []));
}

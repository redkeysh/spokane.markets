import type { Prisma, VendorSurvey } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDay, formatDayRange, formatTimestamp } from "@/lib/admin/format";
import { answerLines, createMarketHref } from "./answers";
import { INBOX_TYPES, statusFilter, type InboxParams, type InboxStatus, type InboxType } from "./model";
import { reportTargets } from "./report-targets";
import type {
  InboxApplication,
  InboxItem,
  InboxMarket,
  InboxMessage,
  InboxPhoto,
  InboxReport,
  InboxReview,
  InboxSubmission,
  InboxSurvey,
  InboxTarget,
  PublicDecisionData,
} from "./types";
import { leadTimeText, personName, reportReasonText, starsText, vendorTypeText, willingnessText } from "./words";

const insensitive = (q: string) => ({ contains: q, mode: "insensitive" as const });

type Filter = { status: InboxStatus; q: string; user: string; item: string };

function statusWhere<T extends string>(type: InboxType, status: InboxStatus): { status?: { in: T[] } } {
  const values = statusFilter(type, status);
  return values ? { status: { in: values as T[] } } : {};
}

function dateText(value: string | null | undefined, now: Date): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDay(value, now) : (value ?? null);
}

// ---- Submissions

const SUBMISSION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  eventTitle: true,
  submitterName: true,
  submitterEmail: true,
  eventDate: true,
  endDate: true,
  venueName: true,
  venueCity: true,
  reviewNotes: true,
  createdEvent: { select: { id: true, status: true, deletedAt: true } },
} satisfies Prisma.SubmissionSelect;

function submissionWhere(f: Filter): Prisma.SubmissionWhereInput {
  return {
    ...statusWhere<"PENDING" | "APPROVED" | "REJECTED">("submissions", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.q
      ? { OR: [{ eventTitle: insensitive(f.q) }, { submitterName: insensitive(f.q) }, { submitterEmail: insensitive(f.q) }, { venueName: insensitive(f.q) }] }
      : {}),
  };
}

function toSubmission(row: Prisma.SubmissionGetPayload<{ select: typeof SUBMISSION_SELECT }>, now: Date): InboxSubmission {
  const start = row.eventDate;
  const end = row.endDate && row.endDate !== start ? row.endDate : null;
  const valid = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  return {
    kind: "submission",
    id: row.id,
    status: row.status,
    sentAt: row.createdAt.toISOString(),
    sentLabel: formatTimestamp(row.createdAt),
    title: row.eventTitle.trim(),
    submitter: { name: row.submitterName.trim(), email: row.submitterEmail.trim() },
    when: end && valid(start) && valid(end) ? formatDayRange(start, end, now) : (dateText(start, now) ?? ""),
    place: [row.venueName.trim(), row.venueCity?.trim()].filter(Boolean).join(", "),
    event: row.createdEvent && !row.createdEvent.deletedAt ? { id: row.createdEvent.id, live: row.createdEvent.status === "PUBLISHED" } : null,
    reviewNotes: row.reviewNotes?.trim() || null,
  };
}

// ---- Reviews

const REVIEW_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  rating: true,
  text: true,
  parkingRating: true,
  varietyRating: true,
  valueRating: true,
  crowdingRating: true,
  weatherPlanRating: true,
  accessibilityRating: true,
  user: { select: { id: true, name: true, email: true } },
  event: { select: { id: true, title: true, slug: true, status: true, deletedAt: true } },
  market: { select: { id: true, name: true, slug: true, deletedAt: true } },
  _count: { select: { photos: true } },
} satisfies Prisma.ReviewSelect;

function reviewWhere(f: Filter): Prisma.ReviewWhereInput {
  return {
    ...statusWhere<"PENDING" | "APPROVED" | "REJECTED">("reviews", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.user ? { userId: f.user } : {}),
    ...(f.q
      ? {
          OR: [
            { text: insensitive(f.q) },
            { user: { is: { name: insensitive(f.q) } } },
            { user: { is: { email: insensitive(f.q) } } },
            { event: { is: { title: insensitive(f.q) } } },
            { market: { is: { name: insensitive(f.q) } } },
          ],
        }
      : {}),
  };
}

type EventRef = { id: string; title: string; slug: string; status: string; deletedAt: Date | null } | null;
type MarketRef = { id: string; name: string; slug: string; deletedAt: Date | null } | null;

function targetOf(event: EventRef, market: MarketRef): InboxTarget | null {
  if (event) {
    return {
      kind: "event",
      title: event.title.trim(),
      adminHref: `/admin/events/${event.id}`,
      publicHref: !event.deletedAt && event.status === "PUBLISHED" ? `/events/${event.slug}` : null,
      gone: !!event.deletedAt,
    };
  }
  if (market) {
    return {
      kind: "market",
      title: market.name.trim(),
      adminHref: `/admin/markets/${market.id}`,
      publicHref: market.deletedAt ? null : `/markets/${market.slug}`,
      gone: !!market.deletedAt,
    };
  }
  return null;
}

const SUB_RATINGS: [keyof Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>, string][] = [
  ["parkingRating", "Parking"],
  ["varietyRating", "Variety"],
  ["valueRating", "Value"],
  ["crowdingRating", "Crowds"],
  ["weatherPlanRating", "Weather plan"],
  ["accessibilityRating", "Accessibility"],
];

function toReview(row: Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>): InboxReview {
  return {
    kind: "review",
    id: row.id,
    status: row.status,
    sentAt: row.createdAt.toISOString(),
    sentLabel: formatTimestamp(row.createdAt),
    rating: row.rating,
    text: row.text?.trim() || null,
    author: { id: row.user?.id ?? null, name: personName(row.user, "Someone without an account") },
    target: targetOf(row.event, row.market),
    details: SUB_RATINGS.flatMap(([key, label]) => {
      const value = row[key];
      return typeof value === "number" ? [`${label} ${starsText(value).replace(/ stars?$/, "")}`] : [];
    }),
    photoCount: row._count.photos,
  };
}

// ---- Photos

const PHOTO_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  url: true,
  alt: true,
  reviewId: true,
  uploadedBy: { select: { id: true, name: true, email: true } },
  event: { select: { id: true, title: true, slug: true, status: true, deletedAt: true, imageUrl: true } },
  market: { select: { id: true, name: true, slug: true, deletedAt: true } },
} satisfies Prisma.PhotoSelect;

function photoWhere(f: Filter): Prisma.PhotoWhereInput {
  return {
    ...statusWhere<"PENDING" | "APPROVED" | "REJECTED">("photos", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.user ? { uploadedById: f.user } : {}),
    ...(f.q
      ? {
          OR: [
            { alt: insensitive(f.q) },
            { uploadedBy: { is: { name: insensitive(f.q) } } },
            { uploadedBy: { is: { email: insensitive(f.q) } } },
            { event: { is: { title: insensitive(f.q) } } },
            { market: { is: { name: insensitive(f.q) } } },
          ],
        }
      : {}),
  };
}

function toPhoto(row: Prisma.PhotoGetPayload<{ select: typeof PHOTO_SELECT }>): InboxPhoto {
  return {
    kind: "photo",
    id: row.id,
    status: row.status,
    sentAt: row.createdAt.toISOString(),
    sentLabel: formatTimestamp(row.createdAt),
    url: row.url,
    alt: row.alt?.trim() || null,
    uploader: { id: row.uploadedBy.id, name: personName(row.uploadedBy) },
    target: targetOf(row.event, row.market),
    eventId: row.event && !row.event.deletedAt ? row.event.id : null,
    isEventPicture: !!row.event?.imageUrl && row.event.imageUrl === row.url,
    fromReview: !!row.reviewId,
  };
}

// ---- Reports

const REPORT_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  targetType: true,
  targetId: true,
  reason: true,
  notes: true,
  severity: true,
  escalationStatus: true,
  internalNotes: true,
  user: { select: { name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ReportSelect;

function reportWhere(f: Filter): Prisma.ReportWhereInput {
  return {
    ...statusWhere<"PENDING" | "RESOLVED" | "DISMISSED">("reports", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.q ? { OR: [{ reason: insensitive(f.q) }, { notes: insensitive(f.q) }, { internalNotes: insensitive(f.q) }] } : {}),
  };
}

async function toReports(rows: Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>[]): Promise<InboxReport[]> {
  const targets = await reportTargets(rows);
  const word: Record<string, string> = { EVENT: "event", MARKET: "market", VENDOR: "vendor", REVIEW: "review" };
  return rows.map((row) => {
    const target = targets.get(row.id)!;
    return {
      kind: "report",
      id: row.id,
      status: row.status,
      sentAt: row.createdAt.toISOString(),
      sentLabel: formatTimestamp(row.createdAt),
      reason: reportReasonText(row.reason),
      notes: row.notes?.trim() || null,
      reporter: row.user ? personName(row.user) : null,
      target: {
        kind: word[row.targetType] ?? "listing",
        title: target.label,
        adminHref: target.adminHref,
        publicHref: target.publicHref,
        gone: target.gone,
      },
      severity: row.severity,
      escalationStatus: row.escalationStatus,
      assignee: row.assignee ? { id: row.assignee.id, name: personName(row.assignee) } : null,
      internalNotes: row.internalNotes?.trim() || null,
    };
  });
}

// ---- Applications

const APPLICATION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  name: true,
  email: true,
  answers: true,
  notes: true,
  reviewedAt: true,
  userId: true,
  form: { select: { type: true, title: true, fields: true } },
  user: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ApplicationSelect;

function applicationWhere(f: Filter): Prisma.ApplicationWhereInput {
  return {
    ...statusWhere<"PENDING" | "APPROVED" | "REJECTED" | "NEEDS_INFO" | "DUPLICATE">("applications", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.q ? { OR: [{ name: insensitive(f.q) }, { email: insensitive(f.q) }, { form: { is: { title: insensitive(f.q) } } }] } : {}),
  };
}

const ROLE_WORDS: Record<string, string> = { ADMIN: "admin", ORGANIZER: "organizer", VENDOR: "vendor", USER: "member" };

async function toApplications(rows: Prisma.ApplicationGetPayload<{ select: typeof APPLICATION_SELECT }>[]): Promise<InboxApplication[]> {
  const emails = [...new Set(rows.map((r) => r.email.toLowerCase()))];
  const counts = emails.length
    ? await db.application.groupBy({ by: ["email"], where: { email: { in: rows.map((r) => r.email) } }, _count: { id: true } })
    : [];
  const byEmail = new Map(counts.map((c) => [c.email.toLowerCase(), c._count.id]));
  return rows.map((row) => {
    const answers = answerLines(row.form.fields, row.answers);
    return {
      kind: "application",
      id: row.id,
      status: row.status,
      sentAt: row.createdAt.toISOString(),
      sentLabel: formatTimestamp(row.createdAt),
      formType: row.form.type,
      formTitle: row.form.title.trim(),
      name: row.name.trim(),
      email: row.email.trim(),
      answers,
      account: row.user ? { id: row.user.id, name: personName(row.user), role: ROLE_WORDS[row.user.role] ?? row.user.role.toLowerCase() } : null,
      notes: row.notes?.trim() || null,
      others: Math.max(0, (byEmail.get(row.email.toLowerCase()) ?? 1) - 1),
      reviewedLabel: row.reviewedAt ? formatTimestamp(row.reviewedAt) : null,
      createMarketHref: row.form.type === "MARKET" ? createMarketHref(answers, { email: row.email, userId: row.userId }) : null,
    };
  });
}

// ---- Messages

const MESSAGE_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  name: true,
  email: true,
  subject: true,
  message: true,
  readAt: true,
} satisfies Prisma.ContactMessageSelect;

function messageWhere(f: Filter): Prisma.ContactMessageWhereInput {
  return {
    ...statusWhere<"PENDING" | "READ" | "ARCHIVED">("messages", f.status),
    ...(f.item ? { id: f.item } : {}),
    ...(f.q ? { OR: [{ name: insensitive(f.q) }, { email: insensitive(f.q) }, { subject: insensitive(f.q) }, { message: insensitive(f.q) }] } : {}),
  };
}

function toMessage(row: Prisma.ContactMessageGetPayload<{ select: typeof MESSAGE_SELECT }>): InboxMessage {
  return {
    kind: "message",
    id: row.id,
    status: row.status,
    sentAt: row.createdAt.toISOString(),
    sentLabel: formatTimestamp(row.createdAt),
    name: row.name.trim() || "Someone",
    email: row.email.trim(),
    subject: row.subject?.trim() || null,
    message: row.message.trim(),
    readLabel: row.readAt ? formatTimestamp(row.readAt) : null,
  };
}

// ---- Vendor survey

function surveyWhere(f: Filter): Prisma.VendorSurveyWhereInput {
  return f.q
    ? {
        OR: [
          { vendorType: insensitive(f.q) },
          { contactName: insensitive(f.q) },
          { contactEmail: insensitive(f.q) },
          { biggestPainPoints: insensitive(f.q) },
          { missingInfo: insensitive(f.q) },
        ],
      }
    : {};
}

function toSurvey(row: VendorSurvey): InboxSurvey {
  return {
    kind: "survey",
    id: row.id,
    sentAt: row.createdAt.toISOString(),
    sentLabel: formatTimestamp(row.createdAt),
    vendorType: vendorTypeText(row.vendorType),
    leadTime: leadTimeText(row.leadTimeNeeded),
    painPoints: row.biggestPainPoints?.trim() || null,
    missingInfo: row.missingInfo?.trim() || null,
    willingness: willingnessText(row.willingnessToPay),
    contactName: row.contactName?.trim() || null,
    contactEmail: row.contactEmail?.trim() || null,
  };
}

// ---- Lists

export type InboxList = { items: InboxItem[]; total: number };

const newest = { createdAt: "desc" } as const;

/** One page of one type, newest first. */
export async function loadInboxList(type: InboxType, params: Pick<InboxParams, "status" | "q" | "user" | "item">, page: { skip: number; take: number }, now = new Date()): Promise<InboxList> {
  const f: Filter = params;
  const paging = { orderBy: newest, skip: page.skip, take: page.take };
  switch (type) {
    case "submissions": {
      const where = submissionWhere(f);
      const [total, rows] = await Promise.all([db.submission.count({ where }), db.submission.findMany({ where, ...paging, select: SUBMISSION_SELECT })]);
      return { total, items: rows.map((r) => toSubmission(r, now)) };
    }
    case "reviews": {
      const where = reviewWhere(f);
      const [total, rows] = await Promise.all([db.review.count({ where }), db.review.findMany({ where, ...paging, select: REVIEW_SELECT })]);
      return { total, items: rows.map(toReview) };
    }
    case "photos": {
      const where = photoWhere(f);
      const [total, rows] = await Promise.all([db.photo.count({ where }), db.photo.findMany({ where, ...paging, select: PHOTO_SELECT })]);
      return { total, items: rows.map(toPhoto) };
    }
    case "reports": {
      const where = reportWhere(f);
      const [total, rows] = await Promise.all([db.report.count({ where }), db.report.findMany({ where, ...paging, select: REPORT_SELECT })]);
      return { total, items: await toReports(rows) };
    }
    case "applications": {
      const where = applicationWhere(f);
      const [total, rows] = await Promise.all([
        db.application.count({ where }),
        db.application.findMany({ where, ...paging, select: APPLICATION_SELECT }),
      ]);
      return { total, items: await toApplications(rows) };
    }
    case "messages": {
      const where = messageWhere(f);
      const [total, rows] = await Promise.all([
        db.contactMessage.count({ where }),
        db.contactMessage.findMany({ where, ...paging, select: MESSAGE_SELECT }),
      ]);
      return { total, items: rows.map(toMessage) };
    }
    case "surveys": {
      const where = surveyWhere(f);
      const [total, rows] = await Promise.all([db.vendorSurvey.count({ where }), db.vendorSurvey.findMany({ where, ...paging })]);
      return { total, items: rows.map(toSurvey) };
    }
  }
}

export type InboxCounts = Record<InboxType, { waiting: number; total: number }>;

/** Waiting and total items of every type: two counts per table. */
export async function loadInboxCounts(): Promise<InboxCounts> {
  const pending = { where: { status: "PENDING" as const } };
  const [sw, st, rw, rt, pw, pt, xw, xt, aw, at, mw, mt, vt] = await Promise.all([
    db.submission.count(pending),
    db.submission.count(),
    db.review.count(pending),
    db.review.count(),
    db.photo.count(pending),
    db.photo.count(),
    db.report.count(pending),
    db.report.count(),
    db.application.count(pending),
    db.application.count(),
    db.contactMessage.count(pending),
    db.contactMessage.count(),
    db.vendorSurvey.count(),
  ]);
  return {
    submissions: { waiting: sw, total: st },
    reviews: { waiting: rw, total: rt },
    photos: { waiting: pw, total: pt },
    reports: { waiting: xw, total: xt },
    applications: { waiting: aw, total: at },
    messages: { waiting: mw, total: mt },
    surveys: { waiting: 0, total: vt },
  };
}

/** The newest few of every type, for the Everything view. */
export async function loadInboxOverview(params: Pick<InboxParams, "status" | "q">, perType: number, now = new Date()): Promise<Record<InboxType, InboxList>> {
  const lists = await Promise.all(
    INBOX_TYPES.map((type) =>
      type === "surveys" && params.status !== "all"
        ? Promise.resolve({ items: [], total: 0 })
        : loadInboxList(type, { ...params, user: "", item: "" }, { skip: 0, take: perType }, now)
    )
  );
  return Object.fromEntries(INBOX_TYPES.map((type, i) => [type, lists[i]])) as Record<InboxType, InboxList>;
}

// ---- One item

async function loadMarket(id: string): Promise<InboxMarket | null> {
  const market = await db.market.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      verificationStatus: true,
      updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      venue: { select: { name: true, city: true } },
      _count: { select: { events: { where: { deletedAt: null } } } },
    },
  });
  if (!market) return null;
  return {
    kind: "market",
    id: market.id,
    name: market.name.trim(),
    status: market.verificationStatus,
    requestedLabel: formatTimestamp(market.updatedAt),
    owner: market.owner ? { id: market.owner.id, name: personName(market.owner), email: market.owner.email } : null,
    place: [market.venue.name.trim(), market.venue.city.trim()].filter(Boolean).join(", "),
    adminHref: `/admin/markets/${market.id}`,
    publicHref: `/markets/${market.slug}`,
    eventCount: market._count.events,
  };
}

/** One item in any status, as the To do pane and the inbox's single-item view show it. */
export async function loadPublicItem(rowType: string, id: string): Promise<PublicDecisionData | null> {
  const one = { status: "all" as const, q: "", user: "", item: id };
  const page = { skip: 0, take: 1 };
  const type: Record<string, InboxType> = { review: "reviews", photo: "photos", report: "reports", application: "applications", message: "messages" };
  if (rowType === "market") return loadMarket(id);
  if (!type[rowType]) return null;
  const list = await loadInboxList(type[rowType], one, page);
  return (list.items[0] as PublicDecisionData | undefined) ?? null;
}

/** The decision key of a To do public decision, as its row type and id. */
export function parsePublicKey(key: string): { rowType: string; id: string } | null {
  const match = key.match(/^(review|photo|report|application|message|market-verification):([A-Za-z0-9_-]{1,64})$/);
  if (!match) return null;
  return { rowType: match[1] === "market-verification" ? "market" : match[1], id: match[2] };
}


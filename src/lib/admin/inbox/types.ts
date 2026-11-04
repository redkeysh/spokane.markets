/** Serializable items of the From the public inbox and the To do panes. Labels are preformatted. */

export type InboxLink = { label: string; href: string };

/** A listing an item is about. */
export type InboxTarget = {
  /** "event", "market", "vendor", "review" */
  kind: string;
  title: string;
  /** The admin page (or the review in the inbox). */
  adminHref: string | null;
  /** The listing on the public site, while it is listed. */
  publicHref: string | null;
  gone: boolean;
};

type Base = {
  id: string;
  /** Database status, e.g. "PENDING". */
  status: string;
  /** "Nov 2, 2026 at 4:10 pm" */
  sentLabel: string;
  sentAt: string;
};

export type InboxSubmission = Base & {
  kind: "submission";
  title: string;
  submitter: { name: string; email: string };
  /** "Sat Jul 17, 2027" */
  when: string;
  place: string;
  /** The event approving it created. */
  event: { id: string; live: boolean } | null;
  reviewNotes: string | null;
};

export type InboxReview = Base & {
  kind: "review";
  rating: number;
  text: string | null;
  author: { id: string | null; name: string };
  target: InboxTarget | null;
  /** "Parking 4 of 5" */
  details: string[];
  photoCount: number;
};

export type InboxPhoto = Base & {
  kind: "photo";
  url: string;
  alt: string | null;
  uploader: { id: string; name: string };
  target: InboxTarget | null;
  /** The event the photo belongs to, for "Use as the event picture". */
  eventId: string | null;
  /** The event already uses this photo as its picture. */
  isEventPicture: boolean;
  fromReview: boolean;
};

export type InboxReport = Base & {
  kind: "report";
  reason: string;
  notes: string | null;
  reporter: string | null;
  target: InboxTarget;
  severity: string;
  escalationStatus: string;
  assignee: { id: string; name: string } | null;
  internalNotes: string | null;
};

export type InboxApplication = Base & {
  kind: "application";
  formType: string;
  formTitle: string;
  name: string;
  email: string;
  answers: { label: string; value: string }[];
  account: { id: string; name: string; role: string } | null;
  notes: string | null;
  /** Other applications sent with the same email. */
  others: number;
  reviewedLabel: string | null;
  /** /admin/markets/new prefilled from the answers, for market applications. */
  createMarketHref: string | null;
};

export type InboxMessage = Base & {
  kind: "message";
  name: string;
  email: string;
  subject: string | null;
  message: string;
  readLabel: string | null;
};

export type InboxSurvey = {
  kind: "survey";
  id: string;
  sentLabel: string;
  sentAt: string;
  vendorType: string;
  leadTime: string;
  painPoints: string | null;
  missingInfo: string | null;
  willingness: string;
  contactName: string | null;
  contactEmail: string | null;
};

export type InboxMarket = {
  kind: "market";
  id: string;
  name: string;
  /** VERIFIED, PENDING or UNVERIFIED. */
  status: string;
  requestedLabel: string;
  owner: { id: string; name: string; email: string } | null;
  place: string;
  adminHref: string;
  publicHref: string;
  eventCount: number;
};

export type InboxItem = InboxSubmission | InboxReview | InboxPhoto | InboxReport | InboxApplication | InboxMessage | InboxSurvey;

/** One item as a To do pane shows it. */
export type PublicDecisionData = InboxReview | InboxPhoto | InboxReport | InboxApplication | InboxMessage | InboxMarket;

/** What an inbox action did. `decisionId` groups its audit entries for Undo. */
export type InboxActionResult =
  | {
      ok: true;
      message: string;
      decisionId: string | null;
      /** Undo can reverse it (it changed something and nothing about it is one way). */
      undoable: boolean;
      changed: string[];
    }
  | { ok: false; error: string };

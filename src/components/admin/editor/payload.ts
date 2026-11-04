/**
 * What the editor sends to its server actions and how each part maps onto
 * the event and submission writes. Pure: validation and mapping only.
 */
import { z } from "zod";
import type { EventFieldChanges, ScheduleDayChange } from "@/lib/events/mutations";
import type { SubmissionDraft } from "@/lib/submissions/draft";
import { startOfPacificDay } from "@/lib/admin/format";
import {
  DETAIL_FIELDS,
  DETAIL_KEYS,
  MODE_FIELDS,
  PLACE_PARTS,
  isWebAddress,
  normalizeLink,
  type DetailField,
  type DetailKey,
  type EditorErrorField,
} from "./model";

/** A value that cannot be saved, with the field to show the message under. */
export class FieldError extends Error {
  constructor(
    message: string,
    readonly field: EditorErrorField
  ) {
    super(message);
  }
}

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date for every day.");
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Choose when every day opens and closes.");

export const daySchema = z
  .object({
    date: dateString,
    allDay: z.boolean(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
  })
  .superRefine((day, ctx) => {
    if (day.allDay) return;
    if (!timeString.safeParse(day.startTime).success || !timeString.safeParse(day.endTime).success) {
      ctx.addIssue({ code: "custom", message: "Choose when every day opens and closes, or tick All day." });
    }
  });

const placeSchema = z.object({
  name: z.string().trim().max(200),
  address: z.string().trim().max(300),
  city: z.string().trim().max(100),
  state: z.string().trim().max(50),
  zip: z.string().trim().max(10),
});

function linkField(kind: "website" | "facebook" | "instagram", label: string) {
  return z
    .string()
    .max(2000)
    .transform((v) => normalizeLink(v, kind))
    .refine(isWebAddress, `${label} must be a web address, such as example.com.`);
}

const pictureField = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => !v || v.startsWith("/uploads/") || /^https?:\/\//i.test(v), "The picture must be an uploaded file or a web address.");

const detailsSchema = z
  .object(Object.fromEntries(DETAIL_KEYS.map((key) => [key, z.string().max(10000).optional()])) as Record<DetailKey, z.ZodOptional<z.ZodString>>)
  .partial();

const STATUS = z.enum(["PUBLISHED", "PENDING", "DRAFT", "CANCELLED", "REJECTED"]);

/** Every field optional: the editor sends the changed ones only. */
export const editorPayloadSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(200, "Keep the title under 200 characters.").optional(),
  slug: z.string().trim().max(200).optional(),
  description: z.string().max(20000, "Keep the description under 20,000 characters.").optional(),
  days: z.array(daySchema).min(1, "Add at least one day.").max(366, "An event can have at most 366 days.").optional(),
  venueId: z.string().trim().max(100).optional(),
  place: placeSchema.optional(),
  marketId: z.string().trim().max(100).optional(),
  imageUrl: pictureField.optional(),
  showImageInList: z.boolean().optional(),
  imageFocalX: z.number().int().min(0).max(100).optional(),
  imageFocalY: z.number().int().min(0).max(100).optional(),
  tagIds: z.array(z.string().min(1).max(100)).max(50).optional(),
  featureIds: z.array(z.string().min(1).max(100)).max(50).optional(),
  websiteUrl: linkField("website", "Website").optional(),
  facebookUrl: linkField("facebook", "Facebook").optional(),
  instagramUrl: linkField("instagram", "Instagram").optional(),
  participationMode: z.enum(["", "OPEN", "REQUEST_TO_JOIN", "INVITE_ONLY", "CAPACITY_LIMITED"]).optional(),
  vendorCapacity: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,6}$/.test(v), "Spots must be a whole number.")
    .optional(),
  publicIntentListEnabled: z.boolean().nullable().optional(),
  publicIntentNamesEnabled: z.boolean().nullable().optional(),
  publicRosterEnabled: z.boolean().nullable().optional(),
  details: detailsSchema.optional(),
  complianceNotes: z.string().max(10000, "Keep the notes under 10,000 characters.").optional(),
  status: STATUS.optional(),
});

export type EditorPayload = z.input<typeof editorPayloadSchema>;
export type ParsedPayload = z.output<typeof editorPayloadSchema>;

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Some of these values cannot be saved.";
}

const FIELD_NAMES = new Set<string>(MODE_FIELDS.new.filter((key) => key !== "details" && key !== "place"));

/** The editor field the first issue of a payload is about. */
export function issueField(error: z.ZodError): EditorErrorField | undefined {
  const [head, part] = error.issues[0]?.path ?? [];
  if (head === "place") return typeof part === "string" && (PLACE_PARTS as readonly string[]).includes(part) ? (`place.${part}` as EditorErrorField) : "place";
  if (head === "details") return typeof part === "string" && (DETAIL_KEYS as readonly string[]).includes(part) ? (`details.${part}` as EditorErrorField) : undefined;
  return typeof head === "string" && FIELD_NAMES.has(head) ? (head as EditorErrorField) : undefined;
}

/** Submission draft columns to the editor fields that edit them. */
export const DRAFT_FIELDS: Record<string, EditorErrorField> = {
  eventTitle: "title",
  eventDescription: "description",
  scheduleDays: "days",
  venueName: "place.name",
  venueAddress: "place.address",
  venueCity: "place.city",
  venueState: "place.state",
  venueZip: "place.zip",
  marketId: "marketId",
  tagIds: "tagIds",
  featureIds: "featureIds",
  imageUrl: "imageUrl",
  websiteUrl: "websiteUrl",
  facebookUrl: "facebookUrl",
  instagramUrl: "instagramUrl",
};

/** The editor field a refusal from the event or submission writes is about, from its message. */
export function refusalField(message: string): EditorErrorField | undefined {
  if (message === "That venue does not exist or is archived.") return "venueId";
  if (message === "That market does not exist or is archived.") return "marketId";
  if (message === "An event needs at least one day.") return "days";
  if (message === "One of the tags no longer exists.") return "tagIds";
  if (message === "One of the features no longer exists.") return "featureIds";
  if (/web address|\/events\/|lowercase letters, numbers and single hyphens/.test(message)) return "slug";
  return undefined;
}

function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toScheduleChanges(days: z.output<typeof daySchema>[]): ScheduleDayChange[] {
  return days.map((d) =>
    d.allDay ? { date: d.date, allDay: true } : { date: d.date, allDay: false, startTime: d.startTime, endTime: d.endTime }
  );
}

/** A detail value as its column stores it. Throws a FieldError for a value the column cannot hold. */
export function detailToColumn(field: DetailField, raw: string): unknown {
  const value = raw.trim();
  if (value === "") return null;
  const refuse = (message: string) => new FieldError(message, `details.${field.key as DetailKey}`);
  switch (field.kind) {
    case "enum":
      if (!field.options?.some((o) => o.value === value)) throw refuse(`${field.label} has a choice that does not exist.`);
      return value;
    case "int": {
      if (!/^\d{1,9}$/.test(value)) throw refuse(`${field.label} must be a whole number.`);
      return Number(value);
    }
    case "yesno":
      if (value !== "yes" && value !== "no") throw refuse(`${field.label} must be yes or no.`);
      return value === "yes";
    case "date":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw refuse(`${field.label} must be a date.`);
      return startOfPacificDay(value);
    default:
      return value;
  }
}

export type EventWrite = {
  /** For updateEventFields; never carries a status. */
  changes: EventFieldChanges;
  /** The status the owner chose, applied after the fields are saved. */
  status?: z.output<typeof STATUS>;
  /** A place typed in by hand, to find or add before saving. */
  newPlace?: z.output<typeof placeSchema>;
};

type DetailChanges = NonNullable<EventFieldChanges["details"]>;

/** Splits a parsed payload into the event field changes, the status and a new place. */
export function toEventWrite(payload: ParsedPayload): EventWrite {
  const changes: EventFieldChanges = {};
  if (payload.title !== undefined) changes.title = payload.title;
  if (payload.slug !== undefined) changes.slug = payload.slug;
  if (payload.description !== undefined) changes.description = blankToNull(payload.description) ?? null;
  if (payload.days !== undefined) changes.scheduleDays = toScheduleChanges(payload.days);
  if (payload.venueId) changes.venueId = payload.venueId;
  if (payload.marketId !== undefined) changes.marketId = payload.marketId || null;
  if (payload.imageUrl !== undefined) changes.imageUrl = payload.imageUrl || null;
  if (payload.showImageInList !== undefined) changes.showImageInList = payload.showImageInList;
  if (payload.imageFocalX !== undefined) changes.imageFocalX = payload.imageFocalX;
  if (payload.imageFocalY !== undefined) changes.imageFocalY = payload.imageFocalY;
  if (payload.tagIds !== undefined) changes.tagIds = [...new Set(payload.tagIds)];
  if (payload.featureIds !== undefined) changes.featureIds = [...new Set(payload.featureIds)];
  if (payload.websiteUrl !== undefined) changes.websiteUrl = payload.websiteUrl || null;
  if (payload.facebookUrl !== undefined) changes.facebookUrl = payload.facebookUrl || null;
  if (payload.instagramUrl !== undefined) changes.instagramUrl = payload.instagramUrl || null;
  if (payload.complianceNotes !== undefined) changes.complianceNotes = blankToNull(payload.complianceNotes) ?? null;
  if (payload.participationMode !== undefined) changes.participationMode = payload.participationMode || null;
  if (payload.vendorCapacity !== undefined) changes.vendorCapacity = payload.vendorCapacity === "" ? null : Number(payload.vendorCapacity);
  if (payload.publicIntentListEnabled !== undefined) changes.publicIntentListEnabled = payload.publicIntentListEnabled;
  if (payload.publicIntentNamesEnabled !== undefined) changes.publicIntentNamesEnabled = payload.publicIntentNamesEnabled;
  if (payload.publicRosterEnabled !== undefined) changes.publicRosterEnabled = payload.publicRosterEnabled;

  const details: Record<string, DetailChanges[keyof DetailChanges]> = {};
  for (const field of DETAIL_FIELDS as readonly DetailField[]) {
    const raw = payload.details?.[field.key as DetailKey];
    if (raw !== undefined) details[field.key] = detailToColumn(field, raw) as DetailChanges[keyof DetailChanges];
  }
  if (Object.keys(details).length > 0) changes.details = details as DetailChanges;

  const place = payload.place;
  const newPlace = !payload.venueId && place && place.name && place.address ? place : undefined;
  return { changes, status: payload.status, newPlace };
}

/** Fields a series shares across its dates; title, dates, web address, details and status stay per date. */
export const SERIES_SHARED_CHANGES = [
  "description",
  "imageUrl",
  "showImageInList",
  "imageFocalX",
  "imageFocalY",
  "tagIds",
  "featureIds",
  "websiteUrl",
  "facebookUrl",
  "instagramUrl",
  "venueId",
  "marketId",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
] as const satisfies readonly (keyof EventFieldChanges)[];

/** The part of a write that every date of a series takes. */
export function sharedPart(write: EventWrite): EventFieldChanges {
  const changes: EventFieldChanges = {};
  for (const key of SERIES_SHARED_CHANGES) {
    if (write.changes[key] !== undefined) (changes as Record<string, unknown>)[key] = write.changes[key];
  }
  return changes;
}

/** A parsed payload as a submission draft: a submission keeps its place as text and has no web address. */
export function toSubmissionDraft(payload: ParsedPayload): SubmissionDraft {
  const draft: SubmissionDraft = {};
  if (payload.title !== undefined) draft.eventTitle = payload.title;
  if (payload.description !== undefined) draft.eventDescription = payload.description;
  if (payload.days !== undefined) {
    draft.scheduleDays = payload.days.map((d) =>
      d.allDay ? { date: d.date, allDay: true } : { date: d.date, allDay: false, startTime: d.startTime, endTime: d.endTime }
    );
  }
  if (payload.place) {
    draft.venueName = payload.place.name;
    draft.venueAddress = payload.place.address;
    draft.venueCity = payload.place.city;
    draft.venueState = payload.place.state;
    draft.venueZip = payload.place.zip;
  }
  if (payload.marketId !== undefined) draft.marketId = payload.marketId || null;
  if (payload.imageUrl !== undefined) draft.imageUrl = payload.imageUrl || null;
  if (payload.tagIds !== undefined) draft.tagIds = [...new Set(payload.tagIds)];
  if (payload.featureIds !== undefined) draft.featureIds = [...new Set(payload.featureIds)];
  if (payload.websiteUrl !== undefined) draft.websiteUrl = payload.websiteUrl || null;
  if (payload.facebookUrl !== undefined) draft.facebookUrl = payload.facebookUrl || null;
  if (payload.instagramUrl !== undefined) draft.instagramUrl = payload.instagramUrl || null;
  return draft;
}

"use server";

import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import { EventMutationError, archiveEvents, restoreEvents, setEventStatuses, updateEventFields, type EventFieldChanges } from "@/lib/events/mutations";
import { placeProblems } from "@/lib/events/readiness";
import { getSeriesFor } from "@/lib/events/series";
import { eventSlugProblem } from "@/lib/events/slug";
import { createEvent } from "@/lib/shared/event-service";
import { rejectSubmission } from "@/lib/submission-approval";
import { publishSubmission, saveSubmissionDraft, submissionDraftSchema, type SubmissionDraft } from "@/lib/submissions/draft";
import { nearestActiveVenue, venueOutcome, type VenueOutcome } from "@/lib/submissions/venue-outcome";
import { findOrCreateVenue, lookupVenue } from "@/lib/venues/resolve";
import { PLACE_PARTS, autoSlug, joinNames, type EditorErrorField } from "@/components/admin/editor/model";
import {
  DRAFT_FIELDS,
  FieldError,
  editorPayloadSchema,
  firstIssue,
  issueField,
  refusalField,
  sharedPart,
  toEventWrite,
  toScheduleChanges,
  toSubmissionDraft,
  type EditorPayload,
  type EventWrite,
} from "@/components/admin/editor/payload";

export type EditorActionResult =
  | {
      ok: true;
      message: string;
      /** Groups the audit entries; pass it to undoEditorDecision. */
      decisionId?: string;
      /** For a created event or a published submission. */
      eventId?: string;
      /** Set when the fields saved but publishing was refused, with the reason. */
      refused?: string;
      published?: boolean;
      notified?: string[];
    }
  | EditorRefusal;

/** `field` names the field the error belongs under, when it is about one. */
export type EditorRefusal = { ok: false; error: string; field?: EditorErrorField };

const NOT_ALLOWED = "You need to be signed in as an admin to do that.";

function refusal(error: string, field?: EditorErrorField): EditorRefusal {
  return field ? { ok: false, error, field } : { ok: false, error };
}

function failure(err: unknown, fallback: string): EditorRefusal {
  if (err instanceof FieldError) return refusal(err.message, err.field);
  if (err instanceof EventMutationError) return refusal(err.message, refusalField(err.message));
  if (err instanceof Error && err.message === "Unauthorized") return refusal(NOT_ALLOWED);
  console.error("[admin/editor]", err);
  return refusal(fallback);
}

function invalid(error: z.ZodError): EditorRefusal {
  return refusal(firstIssue(error), issueField(error));
}

/** Why a submission draft cannot be saved, with its field, or null when it can. */
function draftProblem(draft: SubmissionDraft): EditorRefusal | null {
  const parsed = submissionDraftSchema.safeParse(draft);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const column = issue?.path[0];
  return refusal(issue?.message ?? "Some of these values cannot be saved.", typeof column === "string" ? DRAFT_FIELDS[column] : undefined);
}

/** Finds the place typed in by hand, or adds it with a CREATE_VENUE audit entry, and returns its id. */
async function resolveNewPlace(place: NonNullable<EventWrite["newPlace"]>, actorId: string): Promise<string> {
  const missing = PLACE_PARTS.find((part) => !place[part]);
  if (missing) throw new FieldError("A new place needs its name, street, city, state and ZIP.", `place.${missing}`);
  const resolved = await findOrCreateVenue(place);
  if ("error" in resolved) throw new FieldError(resolved.error, "place");
  if (resolved.created) {
    await logAudit(actorId, "CREATE_VENUE", "VENUE", resolved.venueId, {
      newValue: place,
      details: { title: place.name, at: new Date().toISOString() },
    });
  }
  return resolved.venueId;
}

function hasChanges(changes: object): boolean {
  return Object.keys(changes).length > 0;
}

function publishedMessage(title: string, notified: string[]): string {
  return notified.length > 0 ? `Published ${title} and told ${joinNames(notified)}.` : `Published ${title}.`;
}

/**
 * Saves the changed fields of an event. With `publish`, then puts it on the site (the place is
 * checked first; when it cannot be published the fields stay saved and `refused` says why). With
 * `applyToSeries`, the shared fields go to every date of its series too.
 */
export async function saveEventAction(
  id: string,
  payload: EditorPayload,
  options: { publish?: boolean; applyToSeries?: boolean } = {}
): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const actorId = session.user.id;
    const parsed = editorPayloadSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);
    const write = toEventWrite(parsed.data);
    const decisionId = newDecisionId();

    if (write.newPlace) write.changes.venueId = await resolveNewPlace(write.newPlace, actorId);

    const target = options.publish ? "PUBLISHED" : write.status;
    const changes = { ...write.changes };
    if (target && target !== "PUBLISHED" && target !== "REJECTED") changes.status = target;

    let title: string | null = null;
    if (hasChanges(changes)) {
      const saved = await updateEventFields(id, changes, actorId, { decisionId });
      title = saved.title;
    }

    if (options.applyToSeries) {
      const series = await getSeriesFor(id);
      const shared = sharedPart(write);
      for (const otherId of series?.eventIds ?? []) {
        if (otherId === id) continue;
        if (hasChanges(shared)) await updateEventFields(otherId, shared, actorId, { decisionId });
      }
    }

    title ??= (await db.event.findUnique({ where: { id }, select: { title: true } }))?.title ?? "the event";

    if (target === "PUBLISHED") {
      const result = await setEventStatuses([id], "PUBLISHED", actorId, { decisionId });
      revalidateAdmin();
      if (result.refused.length > 0) {
        return { ok: true, message: "Saved, but not published.", decisionId, refused: result.refused[0].reason, published: false };
      }
      return { ok: true, message: publishedMessage(title, result.notified), decisionId, published: true, notified: result.notified };
    }
    if (target === "REJECTED") {
      const result = await setEventStatuses([id], "REJECTED", actorId, { decisionId });
      revalidateAdmin();
      return { ok: true, message: `Rejected ${title}.`, decisionId, notified: result.notified };
    }
    revalidateAdmin();
    return { ok: true, message: options.applyToSeries ? "Saved on every date of the series." : "Saved.", decisionId };
  } catch (err) {
    return failure(err, "The event could not be saved. Try again.");
  }
}

/** Saves the changed fields, then rejects the event with the reason (added to its notes). */
export async function rejectEventAction(id: string, payload: EditorPayload, reason: string): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const actorId = session.user.id;
    const note = reason.trim();
    if (!note) return { ok: false, error: "Choose a reason." };
    const parsed = editorPayloadSchema.safeParse({ ...payload, status: undefined });
    if (!parsed.success) return invalid(parsed.error);
    const write = toEventWrite(parsed.data);
    const decisionId = newDecisionId();
    if (write.newPlace) write.changes.venueId = await resolveNewPlace(write.newPlace, actorId);
    if (hasChanges(write.changes)) await updateEventFields(id, write.changes, actorId, { decisionId });
    const result = await setEventStatuses([id], "REJECTED", actorId, { decisionId, reason: note });
    revalidateAdmin();
    const title = (await db.event.findUnique({ where: { id }, select: { title: true } }))?.title ?? "the event";
    const told = result.notified.length > 0 ? ` ${joinNames(result.notified)} was told.` : "";
    return { ok: true, message: `Rejected ${title}: ${note}.${told}`, decisionId, notified: result.notified };
  } catch (err) {
    return failure(err, "The event could not be rejected. Try again.");
  }
}

/** Archives the event: out of every list, restorable. */
export async function archiveEventAction(id: string): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const decisionId = newDecisionId();
    const result = await archiveEvents([id], session.user.id, { decisionId });
    revalidateAdmin();
    if (result.archived.length === 0) return { ok: false, error: "It is already archived." };
    return { ok: true, message: "Archived. It is out of every list and can be restored.", decisionId };
  } catch (err) {
    return failure(err, "The event could not be archived. Try again.");
  }
}

export async function restoreEventAction(id: string): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const decisionId = newDecisionId();
    const result = await restoreEvents([id], session.user.id, { decisionId });
    revalidateAdmin();
    if (result.restored.length === 0) return { ok: false, error: "It is not archived." };
    return { ok: true, message: "Restored.", decisionId };
  } catch (err) {
    return failure(err, "The event could not be restored. Try again.");
  }
}

/** Fields createEvent does not take, written in its transaction right after the insert. */
const CREATED_AFTER = [
  "showImageInList",
  "imageFocalX",
  "imageFocalY",
  "complianceNotes",
  "participationMode",
  "vendorCapacity",
  "publicIntentListEnabled",
  "publicIntentNamesEnabled",
  "publicRosterEnabled",
] as const satisfies readonly (keyof EventFieldChanges)[];

/** Creates an event from the editor. With `publish` it goes on the site at once. */
export async function createEventAction(payload: EditorPayload, options: { publish?: boolean } = {}): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const actorId = session.user.id;
    const parsed = editorPayloadSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    if (!data.title) return refusal("Give it a title.", "title");
    if (!data.days?.length) return refusal("Add at least one day.", "days");
    const write = toEventWrite(data);
    if (data.marketId) {
      const market = await db.market.findFirst({ where: { id: data.marketId, deletedAt: null }, select: { id: true } });
      if (!market) return refusal("That market does not exist or is archived.", "marketId");
    }
    const firstDate = [...data.days].map((d) => d.date).sort()[0];
    const slug = data.slug?.trim() || autoSlug(data.title, firstDate);
    const slugProblem = await eventSlugProblem(null, slug);
    if (slugProblem) return refusal(slugProblem, "slug");

    let venueId = write.changes.venueId ?? null;
    if (!venueId && write.newPlace) venueId = await resolveNewPlace(write.newPlace, actorId);
    if (!venueId) return refusal("Choose a place, or add a new one.", "venueId");
    const venue = await db.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { name: true, address: true, city: true, state: true, zip: true, deletedAt: true },
    });
    if (!venue) return refusal("That place does not exist or is archived.", "venueId");

    const publish = options.publish || write.status === "PUBLISHED";
    if (publish) {
      const problems = placeProblems(venue);
      if (problems.length > 0) return refusal(problems.map((p) => p.message).join(" "), write.newPlace ? "place" : "venueId");
    }
    const status = publish ? "PUBLISHED" : write.status && write.status !== "REJECTED" ? write.status : "DRAFT";
    const decisionId = newDecisionId();
    const at = new Date();
    const { changes } = write;
    const more: Record<string, unknown> = { ...changes.details };
    for (const key of CREATED_AFTER) if (changes[key] !== undefined) more[key] = changes[key];

    const created = await createEvent(
      {
        title: data.title,
        slug,
        description: changes.description ?? null,
        startDate: "",
        endDate: "",
        venueId,
        marketId: changes.marketId ?? null,
        imageUrl: changes.imageUrl ?? null,
        websiteUrl: changes.websiteUrl ?? null,
        facebookUrl: changes.facebookUrl ?? null,
        instagramUrl: changes.instagramUrl ?? null,
        scheduleDays: toScheduleChanges(data.days),
        tagIds: changes.tagIds,
        featureIds: changes.featureIds,
      },
      {
        status,
        isAdminAction: true,
        inTransaction: async (tx, event) => {
          if (Object.keys(more).length > 0) await tx.event.update({ where: { id: event.id }, data: more as Prisma.EventUncheckedUpdateInput });
          await tx.auditLog.create({
            data: {
              userId: actorId,
              action: "CREATE_EVENT",
              targetType: "EVENT",
              targetId: event.id,
              metadata: {
                title: data.title,
                newValue: { status, slug: event.slug, venueId },
                details: { title: data.title, at: at.toISOString(), decisionId },
              } as Prisma.InputJsonValue,
            },
          });
        },
      }
    );
    if (!created.event) return { ok: false, error: created.error ?? "The event could not be created." };
    revalidateAdmin({ eventSlugs: [created.event.slug] });
    return {
      ok: true,
      message: publish ? `Published ${data.title}.` : `Saved ${data.title} as ${status === "PENDING" ? "pending" : "a draft"}.`,
      decisionId,
      eventId: created.event.id,
      published: publish,
    };
  } catch (err) {
    return failure(err, "The event could not be created. Try again.");
  }
}

/** Saves edits to a pending submission (dates, place, tags, features, market and links included). */
export async function saveSubmissionAction(id: string, payload: EditorPayload): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = editorPayloadSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);
    const draft = toSubmissionDraft(parsed.data);
    const problem = draftProblem(draft);
    if (problem) return problem;
    const decisionId = newDecisionId();
    const result = await saveSubmissionDraft(id, draft, session.user.id, { decisionId });
    revalidateAdmin();
    if (!result.ok) return refusal(result.error, refusalField(result.error));
    return { ok: true, message: "Saved.", decisionId };
  } catch (err) {
    return failure(err, "The submission could not be saved. Try again.");
  }
}

/** Saves the edits, then publishes the submission as a live event and tells the submitter. */
export async function publishSubmissionAction(id: string, payload: EditorPayload): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = editorPayloadSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);
    const draft = toSubmissionDraft(parsed.data);
    const problem = draftProblem(draft);
    if (problem) return problem;
    const current = await db.submission.findUnique({
      where: { id },
      select: { eventTitle: true, venueName: true, venueAddress: true, venueCity: true, venueState: true, venueZip: true },
    });
    if (!current) return refusal("Submission not found.");
    const missing = missingPlacePart({
      name: draft.venueName ?? current.venueName,
      address: draft.venueAddress ?? current.venueAddress,
      city: draft.venueCity !== undefined ? draft.venueCity : current.venueCity,
      state: draft.venueState !== undefined ? draft.venueState : current.venueState,
      zip: draft.venueZip !== undefined ? draft.venueZip : current.venueZip,
    });
    if (missing) return refusal(`Can't publish yet: no ${PLACE_PART_NAMES[missing]}.`, `place.${missing}`);
    const decisionId = newDecisionId();
    const result = await publishSubmission(id, Object.keys(draft).length > 0 ? draft : null, session.user.id, { decisionId });
    revalidateAdmin();
    if (!result.ok) return refusal(result.error, refusalField(result.error));
    const title = draft.eventTitle?.trim() || current.eventTitle;
    return { ok: true, message: publishedMessage(title, result.notified), decisionId, eventId: result.eventId, published: true, notified: result.notified };
  } catch (err) {
    return failure(err, "The submission could not be published. Try again.");
  }
}

const PLACE_PART_NAMES: Record<(typeof PLACE_PARTS)[number], string> = {
  name: "place name",
  address: "street",
  city: "city",
  state: "state",
  zip: "ZIP",
};

/** The first part of a place that is empty. */
function missingPlacePart(place: Record<(typeof PLACE_PARTS)[number], string | null | undefined>): (typeof PLACE_PARTS)[number] | null {
  return PLACE_PARTS.find((part) => !place[part]?.trim()) ?? null;
}

/** Saves the edits, then rejects the submission; the reason goes to its review notes and the submitter is told. */
export async function rejectSubmissionAction(id: string, payload: EditorPayload, reason: string): Promise<EditorActionResult> {
  try {
    const session = await requireAdminAction();
    const note = reason.trim();
    if (!note) return { ok: false, error: "Choose a reason." };
    const parsed = editorPayloadSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);
    const decisionId = newDecisionId();
    const draft = toSubmissionDraft(parsed.data);
    if (Object.keys(draft).length > 0) {
      const problem = draftProblem(draft);
      if (problem) return problem;
      const saved = await saveSubmissionDraft(id, draft, session.user.id, { decisionId });
      if (!saved.ok) return refusal(saved.error, refusalField(saved.error));
    }
    const submission = await db.submission.findUnique({ where: { id }, select: { eventTitle: true, submitterName: true } });
    const result = await rejectSubmission(id, session.user.id, note, {
      auditMeta: { details: { decisionId, title: submission?.eventTitle ?? null, reason: note, at: new Date().toISOString() } },
    });
    revalidateAdmin();
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: `Rejected ${submission?.eventTitle ?? "the submission"}: ${note}.`, decisionId };
  } catch (err) {
    return failure(err, "The submission could not be rejected. Try again.");
  }
}

export type PlaceCheckResult =
  | { status: "existing"; venueId: string; name: string; address: string; archived: boolean }
  | { status: "new"; nearest: { venueId: string; name: string; address: string; meters: number } | null }
  | { status: "unplaceable" }
  | { status: "error"; error: string };

/**
 * Runs the place matcher on a place typed in by hand, without adding anything: the existing place it
 * matches, or the nearest existing place when it would be new.
 */
export async function checkPlaceAction(place: { name: string; address: string; city: string; state: string; zip: string }): Promise<PlaceCheckResult> {
  try {
    await requireAdminAction();
    const fields = {
      name: place.name.trim(),
      address: place.address.trim(),
      city: place.city.trim(),
      state: place.state.trim(),
      zip: place.zip.trim(),
    };
    if (!fields.name || !fields.address || !fields.city || !fields.state || !fields.zip) {
      return { status: "error", error: "Fill in the name, street, city, state and ZIP first." };
    }
    const lookup = await lookupVenue(fields);
    if (lookup.status === "existing") {
      const v = lookup.venue;
      return { status: "existing", venueId: v.id, name: v.name, address: v.address, archived: v.deletedAt !== null };
    }
    if (lookup.status === "unplaceable") return { status: "unplaceable" };
    return { status: "new", nearest: await nearestActiveVenue(lookup.coords) };
  } catch (err) {
    const result = failure(err, "The place could not be checked. Try again.");
    return { status: "error", error: result.error };
  }
}

/** What publishing a submission would do with its place, for the unsaved place fields. */
export async function checkSubmissionPlaceAction(place: {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}): Promise<VenueOutcome | { outcome: "error"; error: string }> {
  try {
    await requireAdminAction();
    return await venueOutcome({
      venueName: place.name,
      venueAddress: place.address,
      venueCity: place.city || null,
      venueState: place.state || null,
      venueZip: place.zip || null,
    });
  } catch (err) {
    return { outcome: "error", error: failure(err, "The place could not be checked. Try again.").error };
  }
}

/** Why a web address cannot be used for this event, or null when it can. */
export async function checkWebAddressAction(eventId: string | null, slug: string): Promise<string | null> {
  try {
    await requireAdminAction();
    return await eventSlugProblem(eventId, slug.trim());
  } catch (err) {
    return failure(err, "The web address could not be checked.").error;
  }
}

/** Adds a tag from the editor's filter field, or returns the tag that already has the name. */
export async function createTagAction(
  name: string
): Promise<{ ok: true; tag: { id: string; name: string; slug: string } } | { ok: false; error: string }> {
  try {
    const session = await requireAdminAction();
    const clean = name.trim().replace(/\s+/g, " ");
    const slug = slugify(clean);
    if (clean.length < 2 || clean.length > 50 || !slug) return { ok: false, error: "A tag name is 2 to 50 letters or numbers." };
    const select = { id: true, name: true, slug: true } as const;
    const existing = await db.tag.findFirst({ where: { OR: [{ name: { equals: clean, mode: "insensitive" } }, { slug }] }, select });
    if (existing) return { ok: true, tag: existing };
    const tag = await db.tag.create({ data: { name: clean, slug }, select });
    await logAudit(session.user.id, "CREATE_TAG", "TAG", tag.id, { details: { title: tag.name, at: new Date().toISOString() } });
    revalidateAdmin();
    return { ok: true, tag };
  } catch (err) {
    return failure(err, "The tag could not be created. Try again.");
  }
}

/** Undoes a decision made in the editor (publish, reject, archive, a status change, a save). */
export async function undoEditorDecisionAction(decisionId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireAdminAction();
    const result = await undoDecision(decisionId, session.user.id);
    revalidateAdmin();
    return { ok: result.ok, message: result.message };
  } catch (err) {
    return { ok: false, message: failure(err, "That could not be undone.").error };
  }
}

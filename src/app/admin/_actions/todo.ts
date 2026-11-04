"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { decisionDetails } from "@/lib/admin/decision-details";
import { getHistory } from "@/lib/admin/history";
import { bringBack, dismissPair, later, laterUntil } from "@/lib/admin/memo";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import { EventMutationError, archiveEvents, setEventStatuses, updateEventFields } from "@/lib/events/mutations";
import { rejectSubmission } from "@/lib/submission-approval";
import { publishSubmission, saveSubmissionDraft } from "@/lib/submissions/draft";
import { venueOutcome } from "@/lib/submissions/venue-outcome";
import { failedPlaceLine, placeLineOf } from "@/components/admin/todo/place-line";
import type { TodoActionResult, TodoHistoryLine, TodoPlaceLine, TodoUndoResult } from "@/components/admin/todo/types";

const id = z.string().trim().min(1).max(64);
const ids = z.array(id).min(1).max(500);
const decisionKey = z.string().trim().min(1).max(4000);
const title = z.string().trim().max(300).optional();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 10:00.");

const scheduleDay = z
  .strictObject({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    allDay: z.boolean(),
    startTime: clock.optional(),
    endTime: clock.optional(),
  })
  .refine((d) => d.allDay || (!!d.startTime && !!d.endTime && d.endTime > d.startTime), "A day closes before it opens.");

const eventEdits = z.strictObject({
  title: z.string().trim().min(1, "The title cannot be empty.").max(200, "Keep the title under 200 characters.").optional(),
  venueId: id.optional(),
  tagIds: z.array(id).max(50).optional(),
  featureIds: z.array(id).max(50).optional(),
  scheduleDays: z.array(scheduleDay).min(1, "An event needs at least one day.").max(366).optional(),
  imageUrl: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .refine((v) => !v || v.startsWith("/uploads/") || /^https?:\/\/\S+$/i.test(v), "A picture link starts with https://."),
  description: z.string().trim().max(20000, "Keep the description under 20,000 characters.").nullable().optional(),
  details: z
    .strictObject({ vendorApplicationState: z.enum(["OPEN", "CLOSED"]).optional(), feeModelVendor: z.string().trim().min(1).max(500).optional() })
    .optional(),
});

const reason = z.string().trim().min(1, "Choose a reason.").max(500);

const placeDraft = z.strictObject({
  venueName: z.string().trim().min(1).max(200).optional(),
  venueAddress: z.string().trim().min(1).max(300).optional(),
  venueCity: z.string().trim().max(100).optional(),
  venueState: z.string().trim().max(50).optional(),
  venueZip: z.string().trim().max(10).optional(),
});

const publishInput = z.strictObject({
  decisionKey,
  eventIds: ids,
  edits: z.record(id, eventEdits).optional(),
});
const rejectInput = z.strictObject({ decisionKey, eventIds: ids, reason, edits: z.record(id, eventEdits).optional() });
const archiveInput = z.strictObject({ decisionKey, eventIds: ids });
const keepInput = z
  .strictObject({
    decisionKey,
    keepId: id,
    archiveIds: ids,
    publish: z.boolean(),
    takeFromOthers: z.boolean(),
  })
  .refine((v) => !v.archiveIds.includes(v.keepId), "The event to keep cannot also be archived.")
  .refine((v) => new Set(v.archiveIds).size === v.archiveIds.length, "Each copy can be archived once.");
const differentInput = z.strictObject({ decisionKey, eventIds: z.array(id).min(2).max(6), title });
const laterInput = z.strictObject({ decisionKey, until: z.enum(["tomorrow", "next-monday"]), title });
const bringBackInput = z.strictObject({ decisionKey, title });
const undoInput = z.strictObject({ decisionId: z.string().trim().min(1).max(100) });
const publishSubmissionInput = z.strictObject({ decisionKey, submissionId: id, draft: placeDraft.optional() });
const rejectSubmissionInput = z.strictObject({ decisionKey, submissionId: id, reason });
const saveInput = z.strictObject({ decisionKey, eventId: id, edits: eventEdits });
const savePlaceInput = z.strictObject({ decisionKey, submissionId: id, draft: placeDraft });
const historyInput = z.strictObject({ targetType: z.enum(["EVENT", "SUBMISSION"]), targetId: id });
const placeInput = z.strictObject({ submissionId: id });

type Failure = { ok: false; error: string };

function parse<S extends z.ZodType>(schema: S, input: unknown): { data: z.output<S> } | Failure {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  return { ok: false, error: parsed.error.issues[0]?.message ?? "That request was not understood." };
}

function failure(err: unknown): Failure {
  if (err instanceof EventMutationError) return { ok: false, error: err.message };
  if (err instanceof Error && err.message === "Unauthorized") return { ok: false, error: "Sign in as an admin to do this." };
  console.error("[todo] action failed:", err);
  return { ok: false, error: "Something went wrong. Try again." };
}

const NOTHING = { changed: [], alreadyThere: [], refused: [], notified: [] };

type EventEdits = z.output<typeof eventEdits>;

/** Tags and features that no longer exist, as a message, or null. */
async function unknownOptions(edits: Record<string, EventEdits>): Promise<string | null> {
  const tagIds = [...new Set(Object.values(edits).flatMap((e) => e.tagIds ?? []))];
  const featureIds = [...new Set(Object.values(edits).flatMap((e) => e.featureIds ?? []))];
  const [tags, features] = await Promise.all([
    tagIds.length ? db.tag.count({ where: { id: { in: tagIds } } }) : 0,
    featureIds.length ? db.feature.count({ where: { id: { in: featureIds } } }) : 0,
  ]);
  if (tags < tagIds.length) return "A chosen tag no longer exists. Reload and choose again.";
  if (features < featureIds.length) return "A chosen feature no longer exists. Reload and choose again.";
  return null;
}

/**
 * Saves the held edits of the decision's rows, then sets every row's status, as one decision.
 * When a step throws, the edits already saved are undone, so nothing half done is left behind.
 */
async function decideEvents(
  actor: string,
  input: { decisionKey: string; eventIds: string[]; edits?: Record<string, EventEdits> },
  status: "PUBLISHED" | "REJECTED",
  reason?: string
): Promise<TodoActionResult> {
  const { eventIds } = input;
  const edits = Object.entries(input.edits ?? {}).filter(([eventId, changes]) => eventIds.includes(eventId) && Object.keys(changes).length > 0);
  const problem = await unknownOptions(Object.fromEntries(edits));
  if (problem) return { ok: false, error: problem };
  const ref = { decisionId: newDecisionId(), decisionKey: input.decisionKey };
  let edited = false;
  let result: Awaited<ReturnType<typeof setEventStatuses>>;
  try {
    for (const [eventId, changes] of edits) {
      await updateEventFields(eventId, changes, actor, ref);
      edited = true;
    }
    result = await setEventStatuses(eventIds, status, actor, reason ? { ...ref, reason } : ref);
  } catch (err) {
    if (edited) {
      try {
        await undoDecision(ref.decisionId, actor);
      } catch (undoErr) {
        console.error("[todo] undoing saved edits failed:", undoErr);
      }
      revalidateAdmin();
    }
    throw err;
  }
  revalidateAdmin();
  return {
    ok: true,
    decisionId: edited || result.changed.length ? ref.decisionId : null,
    changed: result.changed,
    alreadyThere: result.alreadyThere,
    refused: result.refused,
    notified: result.notified,
  };
}

/** Saves held edits of the decision's rows, then publishes every row, as one decision. */
export async function publishEvents(input: z.input<typeof publishInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(publishInput, input);
    if ("error" in parsed) return parsed;
    return await decideEvents(session.user.id, parsed.data, "PUBLISHED");
  } catch (err) {
    return failure(err);
  }
}

/** Saves held edits, then rejects every row with one reason, appended to each event's notes. */
export async function rejectEvents(input: z.input<typeof rejectInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(rejectInput, input);
    if ("error" in parsed) return parsed;
    return await decideEvents(session.user.id, parsed.data, "REJECTED", parsed.data.reason);
  } catch (err) {
    return failure(err);
  }
}

/** Archives rows that already happened. Archived events can be restored. */
export async function archiveDecisionEvents(input: z.input<typeof archiveInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(archiveInput, input);
    if ("error" in parsed) return parsed;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const result = await archiveEvents(parsed.data.eventIds, session.user.id, ref);
    revalidateAdmin();
    return { ok: true, decisionId: result.archived.length ? ref.decisionId : null, ...NOTHING, archived: result.archived };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Same event twice: keeps one copy and archives the others as its duplicates, so the next import
 * skips them. With `publish` the kept copy goes live first; with `takeFromOthers` it gains the
 * tags and features only the others had. When a step fails, the steps before it are undone.
 */
export async function keepOneCopy(input: z.input<typeof keepInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(keepInput, input);
    if ("error" in parsed) return parsed;
    const { keepId, archiveIds, publish, takeFromOthers } = parsed.data;
    const actor = session.user.id;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    let wrote = false;

    if (takeFromOthers) {
      const rows = await db.event.findMany({
        where: { id: { in: [keepId, ...archiveIds] }, deletedAt: null },
        select: { id: true, tags: { select: { id: true } }, features: { select: { id: true } } },
      });
      const keep = rows.find((r) => r.id === keepId);
      if (!keep) return { ok: false, error: "The event to keep does not exist or is archived." };
      const tagIds = [...new Set(rows.flatMap((r) => r.tags.map((t) => t.id)))];
      const featureIds = [...new Set(rows.flatMap((r) => r.features.map((f) => f.id)))];
      const changes = {
        ...(tagIds.length > keep.tags.length ? { tagIds } : {}),
        ...(featureIds.length > keep.features.length ? { featureIds } : {}),
      };
      if (Object.keys(changes).length > 0) {
        await updateEventFields(keepId, changes, actor, ref);
        wrote = true;
      }
    }

    let status: { changed: string[]; alreadyThere: string[]; refused: { id: string; reason: string }[]; notified: string[] } = NOTHING;
    if (publish) {
      status = await setEventStatuses([keepId], "PUBLISHED", actor, ref);
      if (status.refused.length > 0) {
        if (wrote) await undoDecision(ref.decisionId, actor);
        revalidateAdmin();
        return { ok: false, error: `Nothing was changed. ${status.refused[0].reason}` };
      }
      wrote = wrote || status.changed.length > 0;
    }

    let archived: string[];
    try {
      archived = (await archiveEvents(archiveIds, actor, { ...ref, duplicateOfId: keepId })).archived;
    } catch (err) {
      if (wrote) await undoDecision(ref.decisionId, actor);
      throw err;
    }
    revalidateAdmin();
    return { ok: true, decisionId: ref.decisionId, ...status, archived };
  } catch (err) {
    return failure(err);
  }
}

/** Remembers that the events are different, so the pair is never offered again. */
export async function markDifferentEvents(input: z.input<typeof differentInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(differentInput, input);
    if ("error" in parsed) return parsed;
    const unique = [...new Set(parsed.data.eventIds)];
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey, title: parsed.data.title };
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        await dismissPair("not-same-event", unique[i], unique[j], session.user.id, ref);
      }
    }
    revalidateAdmin();
    return { ok: true, decisionId: ref.decisionId, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** Sets a decision aside until tomorrow or next Monday; it returns to the pile then. */
export async function snoozeDecision(input: z.input<typeof laterInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(laterInput, input);
    if ("error" in parsed) return parsed;
    const { decisionKey: key, until, title: name } = parsed.data;
    const ref = { decisionId: newDecisionId(), decisionKey: key, title: name };
    await later(key, laterUntil(until), session.user.id, ref);
    revalidateAdmin();
    return { ok: true, decisionId: ref.decisionId, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** Returns a decision set aside with Later to the pile now. */
export async function bringBackDecision(input: z.input<typeof bringBackInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(bringBackInput, input);
    if ("error" in parsed) return parsed;
    const removed = await bringBack(parsed.data.decisionKey, session.user.id, { title: parsed.data.title });
    revalidateAdmin();
    if (!removed) return { ok: false, error: "It is already back in the pile." };
    return { ok: true, decisionId: null, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** Reverses a decision from its audit entries, leaving rows that changed since as they are. */
export async function undoTodoDecision(input: z.input<typeof undoInput>): Promise<TodoUndoResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(undoInput, input);
    if ("error" in parsed) return { ok: false, message: parsed.error };
    const result = await undoDecision(parsed.data.decisionId, session.user.id);
    revalidateAdmin();
    return { ok: result.ok, message: result.message };
  } catch (err) {
    return { ok: false, message: failure(err).error };
  }
}

/** Publishes a public submission: saves the place fixes held in the pane, then approves it. */
export async function publishSubmissionDecision(input: z.input<typeof publishSubmissionInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(publishSubmissionInput, input);
    if ("error" in parsed) return parsed;
    const { submissionId, draft } = parsed.data;
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const result = await publishSubmission(submissionId, draft && Object.keys(draft).length ? draft : null, session.user.id, ref);
    revalidateAdmin();
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, decisionId: ref.decisionId, changed: [submissionId], alreadyThere: [], refused: [], notified: result.notified };
  } catch (err) {
    return failure(err);
  }
}

/** Rejects a public submission with a reason, which goes to its review notes; a submitter with an account is told. */
export async function rejectSubmissionDecision(input: z.input<typeof rejectSubmissionInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(rejectSubmissionInput, input);
    if ("error" in parsed) return parsed;
    const { submissionId } = parsed.data;
    const submission = await db.submission.findUnique({
      where: { id: submissionId },
      select: { eventTitle: true, submitterName: true, submitterEmail: true },
    });
    if (!submission) return { ok: false, error: "Submission not found." };
    const account = await db.user.findUnique({ where: { email: submission.submitterEmail }, select: { id: true } });
    const notified = account ? [submission.submitterName] : [];
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const result = await rejectSubmission(submissionId, session.user.id, parsed.data.reason, {
      auditMeta: {
        details: {
          ...decisionDetails(ref),
          title: submission.eventTitle.trim(),
          at: new Date().toISOString(),
          reason: parsed.data.reason,
          ...(notified.length ? { notified } : {}),
        },
      },
    });
    revalidateAdmin();
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, decisionId: ref.decisionId, changed: [submissionId], alreadyThere: [], refused: [], notified };
  } catch (err) {
    return failure(err);
  }
}

/** Ctrl+S in a decision pane: saves the held edits without deciding. */
export async function saveEventEdits(input: z.input<typeof saveInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(saveInput, input);
    if ("error" in parsed) return parsed;
    if (Object.keys(parsed.data.edits).length === 0) return { ok: true, decisionId: null, ...NOTHING };
    const problem = await unknownOptions({ [parsed.data.eventId]: parsed.data.edits });
    if (problem) return { ok: false, error: problem };
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    await updateEventFields(parsed.data.eventId, parsed.data.edits, session.user.id, ref);
    revalidateAdmin();
    return { ok: true, decisionId: ref.decisionId, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** Saves the place fixes held in a submission decision without deciding it. */
export async function saveSubmissionPlace(input: z.input<typeof savePlaceInput>): Promise<TodoActionResult> {
  try {
    const session = await requireAdminAction();
    const parsed = parse(savePlaceInput, input);
    if ("error" in parsed) return parsed;
    if (Object.keys(parsed.data.draft).length === 0) return { ok: true, decisionId: null, ...NOTHING };
    const ref = { decisionId: newDecisionId(), decisionKey: parsed.data.decisionKey };
    const result = await saveSubmissionDraft(parsed.data.submissionId, parsed.data.draft, session.user.id, ref);
    revalidateAdmin();
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, decisionId: ref.decisionId, ...NOTHING };
  } catch (err) {
    return failure(err);
  }
}

/** The latest history of one record, for the context pane. Reads only. */
export async function recordHistory(input: z.input<typeof historyInput>): Promise<TodoHistoryLine[]> {
  const session = await requireAdminAction();
  const parsed = historyInput.safeParse(input);
  if (!parsed.success) return [];
  const entries = await getHistory({ ...parsed.data, limit: 6, viewerId: session.user.id });
  return entries.map((e) => ({ id: e.id, time: e.time, timestamp: e.timestamp, sentence: e.sentence }));
}

/**
 * Where approving a submission puts its event, found on the map when the place matches no saved
 * one. Reads only; geocoding can take a few seconds, so the pane asks for it when it opens.
 */
export async function checkSubmissionPlace(input: z.input<typeof placeInput>): Promise<TodoPlaceLine | null> {
  await requireAdminAction();
  const parsed = placeInput.safeParse(input);
  if (!parsed.success) return null;
  const row = await db.submission.findUnique({
    where: { id: parsed.data.submissionId },
    select: { venueName: true, venueAddress: true, venueCity: true, venueState: true, venueZip: true },
  });
  if (!row) return null;
  try {
    return placeLineOf(await venueOutcome(row));
  } catch (err) {
    console.error(`[todo] place lookup for submission ${parsed.data.submissionId} failed:`, err);
    return failedPlaceLine(row);
  }
}

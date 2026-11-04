"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { decisionDetails } from "@/lib/admin/decision-details";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import { loadPublicItem, parsePublicKey } from "@/lib/admin/inbox/load";
import {
  setApplicationNotes,
  setApplicationStatus,
  setMessageStatus,
  setPhotoStatus,
  setReportAssignee,
  setReportNotes,
  setReportStatus,
  setReportTriage,
  setReviewStatus,
  type PublicRef,
  type StatusChange,
} from "@/lib/admin/inbox/moderation";
import { applicationMessage, plural, statusMessage } from "@/lib/admin/inbox/words";
import type { InboxActionResult, PublicDecisionData } from "@/lib/admin/inbox/types";
import { EventMutationError, updateEventFields } from "@/lib/events/mutations";
import { rejectSubmission } from "@/lib/submission-approval";
import { setMarketVerification } from "./markets";

const id = z.string().trim().min(1).max(64);
const ids = z.array(id).min(1).max(200);
const decisionKey = z.string().trim().min(1).max(200).optional();
const reason = z.string().trim().min(1, "Choose a reason.").max(500);

const decideInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("review"), ids, to: z.enum(["APPROVED", "REJECTED"]), decisionKey }),
  z.strictObject({ kind: z.literal("photo"), ids, to: z.enum(["APPROVED", "REJECTED"]), decisionKey }),
  z.strictObject({ kind: z.literal("report"), ids, to: z.enum(["RESOLVED", "DISMISSED"]), decisionKey }),
  z.strictObject({ kind: z.literal("message"), ids, to: z.enum(["PENDING", "READ", "ARCHIVED"]), decisionKey }),
  z.strictObject({
    kind: z.literal("application"),
    ids: z.array(id).length(1),
    to: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO", "DUPLICATE"]),
    notes: z.string().trim().max(2000).optional(),
    decisionKey,
  }),
  z.strictObject({ kind: z.literal("submission"), ids, to: z.literal("REJECTED"), reason, decisionKey }),
  z.strictObject({ kind: z.literal("market"), ids: z.array(id).length(1), to: z.enum(["VERIFIED", "UNVERIFIED"]), decisionKey }),
]);

const pictureInput = z.strictObject({ photoId: id, decisionKey });
const triageInput = z.strictObject({
  reportId: id,
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  escalationStatus: z.enum(["NEW", "TRIAGED", "ESCALATED", "CLOSED"]).optional(),
  internalNotes: z.string().trim().max(5000).optional(),
});
const assignInput = z.strictObject({ reportId: id, assign: z.boolean() });
const applicationNotesInput = z.strictObject({ applicationId: id, notes: z.string().trim().max(2000) });
const keyInput = z.string().trim().min(1).max(200);
const undoInput = z.string().trim().min(1).max(100);

type Failure = { ok: false; error: string };

function failure(err: unknown): Failure {
  if (err instanceof EventMutationError) return { ok: false, error: err.message };
  if (err instanceof Error && err.message === "Unauthorized") return { ok: false, error: "Sign in as an admin to do this." };
  console.error("[inbox] action failed:", err);
  return { ok: false, error: "Something went wrong. Nothing else was changed. Try again." };
}

function parsed<S extends z.ZodType>(schema: S, input: unknown): { data: z.output<S> } | Failure {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "That request was not understood." };
}

type Decide = z.output<typeof decideInput>;

/** Titles for the audit entries, so Done today and History can name each item. */
async function titlesOf(kind: string, list: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (kind === "review") {
    const rows = await db.review.findMany({
      where: { id: { in: list } },
      select: { id: true, event: { select: { title: true } }, market: { select: { name: true } } },
    });
    for (const r of rows) titles.set(r.id, `the review of ${r.event?.title.trim() ?? r.market?.name.trim() ?? "a listing that is gone"}`);
  } else if (kind === "photo") {
    const rows = await db.photo.findMany({
      where: { id: { in: list } },
      select: { id: true, event: { select: { title: true } }, market: { select: { name: true } } },
    });
    for (const p of rows) titles.set(p.id, `a photo for ${p.event?.title.trim() ?? p.market?.name.trim() ?? "a listing that is gone"}`);
  } else if (kind === "message") {
    const rows = await db.contactMessage.findMany({ where: { id: { in: list } }, select: { id: true, name: true, subject: true } });
    for (const m of rows) titles.set(m.id, m.subject?.trim() || `the message from ${m.name.trim()}`);
  } else if (kind === "report") {
    for (const reportId of list) titles.set(reportId, "a report");
  }
  return titles;
}

type Setter = (itemId: string, to: string, actor: string, options: { ref: PublicRef; skipSame: boolean }) => Promise<StatusChange>;

const SETTERS: Record<string, Setter> = {
  review: (itemId, to, actor, o) => setReviewStatus(itemId, to as "APPROVED" | "REJECTED", actor, o),
  photo: (itemId, to, actor, o) => setPhotoStatus(itemId, to as "APPROVED" | "REJECTED", actor, o),
  report: (itemId, to, actor, o) => setReportStatus(itemId, to as "RESOLVED" | "DISMISSED", actor, o),
  message: (itemId, to, actor, o) => setMessageStatus(itemId, to as "PENDING" | "READ" | "ARCHIVED", actor, o),
};

async function decideStatuses(input: Extract<Decide, { kind: "review" | "photo" | "report" | "message" }>, actor: string): Promise<InboxActionResult> {
  const decisionId = newDecisionId();
  const list = [...new Set(input.ids)];
  const titles = await titlesOf(input.kind, list);
  const changed: string[] = [];
  let already = 0;
  let missing = 0;
  for (const itemId of list) {
    const ref: PublicRef = { decisionId, decisionKey: input.decisionKey, title: titles.get(itemId) };
    const result = await SETTERS[input.kind](itemId, input.to, actor, { ref, skipSame: true });
    if (!result.found) missing += 1;
    else if (result.changed) changed.push(itemId);
    else already += 1;
  }
  if (changed.length) revalidateAdmin();
  return {
    ok: true,
    message: statusMessage(input.kind, input.to, changed.length, already, missing),
    decisionId: changed.length ? decisionId : null,
    undoable: changed.length > 0,
    changed,
  };
}

async function decideApplication(input: Extract<Decide, { kind: "application" }>, actor: string): Promise<InboxActionResult> {
  const applicationId = input.ids[0];
  const current = await db.application.findUnique({
    where: { id: applicationId },
    select: { status: true, name: true },
  });
  if (!current) return { ok: false, error: "This application is gone." };
  const name = current.name.trim() || "the applicant";
  if (current.status === input.to && input.notes === undefined) {
    return { ok: true, message: "Nothing changed: it already had that status.", decisionId: null, undoable: false, changed: [] };
  }
  const decisionId = newDecisionId();
  const result = await setApplicationStatus(applicationId, input.to, input.notes, actor, {
    decisionId,
    decisionKey: input.decisionKey,
    title: `the application from ${name}`,
  });
  revalidateAdmin();
  return {
    ok: true,
    message: applicationMessage(input.to, name, { role: result.roleGiven, verification: result.vendorVerification, told: result.told }),
    decisionId,
    undoable: true,
    changed: [applicationId],
  };
}

async function rejectSubmissions(input: Extract<Decide, { kind: "submission" }>, actor: string): Promise<InboxActionResult> {
  const decisionId = newDecisionId();
  const list = [...new Set(input.ids)];
  const rows = await db.submission.findMany({
    where: { id: { in: list } },
    select: { id: true, eventTitle: true, submitterName: true, submitterEmail: true },
  });
  const accounts = new Set(
    (await db.user.findMany({ where: { email: { in: rows.map((r) => r.submitterEmail) } }, select: { email: true } })).map((u) => u.email)
  );
  const changed: string[] = [];
  const told: string[] = [];
  let already = 0;
  for (const row of rows) {
    const notified = accounts.has(row.submitterEmail) ? [row.submitterName] : [];
    const result = await rejectSubmission(row.id, actor, input.reason, {
      auditMeta: {
        details: {
          ...decisionDetails({ decisionId, decisionKey: input.decisionKey }),
          title: row.eventTitle.trim(),
          at: new Date().toISOString(),
          reason: input.reason,
          ...(notified.length ? { notified } : {}),
        },
      },
    });
    if (result.ok) {
      changed.push(row.id);
      told.push(...notified);
    } else already += 1;
  }
  const missing = list.length - rows.length;
  if (changed.length) revalidateAdmin();
  const parts = [
    changed.length ? `Rejected ${changed.length === 1 ? rows.find((r) => r.id === changed[0])!.eventTitle.trim() : plural(changed.length, "submission", "submissions")}: ${input.reason}.` : "Nothing changed.",
    already ? `${plural(already, "was", "were")} already decided.` : "",
    missing ? `${plural(missing, "is", "are")} gone.` : "",
    told.length ? `${told.length === 1 ? told[0] : plural(told.length, "person", "people")} ${told.length === 1 ? "was" : "were"} told.` : "",
  ].filter(Boolean);
  return { ok: true, message: parts.join(" "), decisionId: changed.length ? decisionId : null, undoable: changed.length > 0, changed };
}

async function decideMarket(input: Extract<Decide, { kind: "market" }>): Promise<InboxActionResult> {
  const decisionId = newDecisionId();
  const result = await setMarketVerification({
    marketId: input.ids[0],
    status: input.to,
    decision: { decisionId, decisionKey: input.decisionKey },
  });
  if (!result.ok) return { ok: false, error: result.error };
  const changed = !!result.decisionId;
  return { ok: true, message: result.message, decisionId: changed ? decisionId : null, undoable: changed, changed: changed ? [input.ids[0]] : [] };
}

/**
 * Decides one or more items sent from the public, as one decision Undo can reverse: approve or
 * reject reviews, show or reject photos, resolve or dismiss reports, mark messages read, archived
 * or unread, set an application's status, reject submissions with a reason, or verify a market.
 */
export async function decidePublicItems(input: z.input<typeof decideInput>): Promise<InboxActionResult> {
  try {
    const session = await requireAdminAction();
    const p = parsed(decideInput, input);
    if ("error" in p) return p;
    const data = p.data;
    switch (data.kind) {
      case "application":
        return await decideApplication(data, session.user.id);
      case "submission":
        return await rejectSubmissions(data, session.user.id);
      case "market":
        return await decideMarket(data);
      default:
        return await decideStatuses(data, session.user.id);
    }
  } catch (err) {
    return failure(err);
  }
}

/** Makes a photo its event's picture and shows the photo, as one decision. */
export async function makePhotoEventPicture(input: z.input<typeof pictureInput>): Promise<InboxActionResult> {
  try {
    const session = await requireAdminAction();
    const p = parsed(pictureInput, input);
    if ("error" in p) return p;
    const photo = await db.photo.findUnique({
      where: { id: p.data.photoId },
      select: { id: true, url: true, status: true, event: { select: { id: true, title: true, imageUrl: true, deletedAt: true } } },
    });
    if (!photo) return { ok: false, error: "This photo is gone." };
    if (!photo.event || photo.event.deletedAt) return { ok: false, error: "This photo belongs to no event that is still listed." };
    const event = photo.event;
    const decisionId = newDecisionId();
    const ref = { decisionId, decisionKey: p.data.decisionKey };
    const changed: string[] = [];
    if (event.imageUrl !== photo.url) {
      await updateEventFields(event.id, { imageUrl: photo.url }, session.user.id, ref);
      changed.push(event.id);
    }
    const shown = await setPhotoStatus(photo.id, "APPROVED", session.user.id, {
      ref: { ...ref, title: `a photo for ${event.title.trim()}` },
      skipSame: true,
    });
    if (shown.changed) changed.push(photo.id);
    revalidateAdmin();
    if (changed.length === 0) {
      return { ok: true, message: `${event.title.trim()} already uses this photo.`, decisionId: null, undoable: false, changed };
    }
    return {
      ok: true,
      message: `${event.title.trim()} now uses this photo as its picture${shown.changed ? ", and the photo shows on the site" : ""}.`,
      decisionId,
      undoable: true,
      changed,
    };
  } catch (err) {
    return failure(err);
  }
}

/** Changes a report's severity, escalation or internal notes. */
export async function saveReportTriage(input: z.input<typeof triageInput>): Promise<InboxActionResult> {
  try {
    const session = await requireAdminAction();
    const p = parsed(triageInput, input);
    if ("error" in p) return p;
    const { reportId, ...updates } = p.data;
    const { internalNotes, ...triage } = updates;
    let saved = false;
    if (triage.severity || triage.escalationStatus) saved = (await setReportTriage(reportId, triage, session.user.id)) || saved;
    if (internalNotes !== undefined) saved = (await setReportNotes(reportId, internalNotes, session.user.id)) || saved;
    if (!saved) return { ok: false, error: "This report is gone." };
    revalidateAdmin();
    return { ok: true, message: "Saved the triage details.", decisionId: null, undoable: false, changed: [reportId] };
  } catch (err) {
    return failure(err);
  }
}

/** Assigns a report to the signed-in admin, or unassigns it. */
export async function assignReport(input: z.input<typeof assignInput>): Promise<InboxActionResult> {
  try {
    const session = await requireAdminAction();
    const p = parsed(assignInput, input);
    if ("error" in p) return p;
    const done = await setReportAssignee(p.data.reportId, p.data.assign ? session.user.id : null, session.user.id);
    revalidateAdmin();
    return {
      ok: true,
      message: done ? (p.data.assign ? "Assigned to you." : "Unassigned.") : "Nothing changed.",
      decisionId: null,
      undoable: false,
      changed: done ? [p.data.reportId] : [],
    };
  } catch (err) {
    return failure(err);
  }
}

/** Saves an application's notes without deciding it. */
export async function saveApplicationNotes(input: z.input<typeof applicationNotesInput>): Promise<InboxActionResult> {
  try {
    const session = await requireAdminAction();
    const p = parsed(applicationNotesInput, input);
    if ("error" in p) return p;
    if (!(await setApplicationNotes(p.data.applicationId, p.data.notes, session.user.id))) return { ok: false, error: "This application is gone." };
    revalidateAdmin();
    return { ok: true, message: "Saved the notes.", decisionId: null, undoable: false, changed: [p.data.applicationId] };
  } catch (err) {
    return failure(err);
  }
}

/** The item behind a To do public decision, in any status, or null when it is gone. Reads only. */
export async function getPublicDecisionData(key: z.input<typeof keyInput>): Promise<PublicDecisionData | null> {
  await requireAdminAction();
  const p = keyInput.safeParse(key);
  if (!p.success) return null;
  const parts = parsePublicKey(p.data);
  if (!parts) return null;
  return loadPublicItem(parts.rowType, parts.id);
}

/** Reverses an inbox decision, leaving items that changed since as they are. */
export async function undoPublicDecision(decisionId: z.input<typeof undoInput>): Promise<{ ok: boolean; message: string }> {
  try {
    const session = await requireAdminAction();
    const p = undoInput.safeParse(decisionId);
    if (!p.success) return { ok: false, message: "That request was not understood." };
    const result = await undoDecision(p.data, session.user.id);
    revalidateAdmin();
    return { ok: result.ok, message: result.message };
  } catch (err) {
    return { ok: false, message: failure(err).error };
  }
}

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { pairKey } from "@/lib/events/twins";
import { addDays, pacificDate, startOfPacificDay, weekdayIndex } from "./format";
import { decisionDetails, type DecisionRef } from "./decision-details";
import { revalidateAdmin } from "./revalidate";

export type MemoKind = "later" | "not-same-event" | "not-same-place" | "same-place";

export type MemoOptions = DecisionRef & { title?: string; auditMeta?: Record<string, unknown> };

/** Midnight Pacific at the start of tomorrow, or of the next Monday. */
export function laterUntil(choice: "tomorrow" | "next-monday", now: Date = new Date()): Date {
  const today = pacificDate(now);
  const days = choice === "tomorrow" ? 1 : 7 - weekdayIndex(today);
  return startOfPacificDay(addDays(today, days));
}

function auditDetails(options: MemoOptions, at: Date) {
  return {
    at: at.toISOString(),
    ...(options.title ? { title: options.title } : {}),
    ...decisionDetails(options),
  };
}

/** Saves a memo and its SET_ADMIN_MEMO audit entry in one transaction. */
async function writeMemo(kind: MemoKind, key: string, until: Date | null, actorId: string, options: MemoOptions) {
  const at = new Date();
  const memo = await db.$transaction(async (tx) => {
    const previous = await tx.adminMemo.findUnique({ where: { kind_key: { kind, key } } });
    const saved = await tx.adminMemo.upsert({
      where: { kind_key: { kind, key } },
      create: { kind, key, until, createdById: actorId },
      update: { until, createdById: actorId },
    });
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "SET_ADMIN_MEMO",
        targetType: "ADMIN_MEMO",
        targetId: saved.id,
        metadata: {
          previousValue: previous ? { until: previous.until?.toISOString() ?? null } : null,
          newValue: { kind, key, until: until?.toISOString() ?? null },
          details: auditDetails(options, at),
          ...options.auditMeta,
        } as Prisma.InputJsonValue,
      },
    });
    return saved;
  });
  revalidateAdmin();
  return memo;
}

/** Deletes a memo, if there is one, with a DELETE_ADMIN_MEMO audit entry in the same transaction. */
async function removeMemo(kind: MemoKind, key: string, actorId: string, options: MemoOptions): Promise<boolean> {
  const at = new Date();
  const removed = await db.$transaction(async (tx) => {
    const memo = await tx.adminMemo.findUnique({ where: { kind_key: { kind, key } } });
    if (!memo) return false;
    const deleted = await tx.adminMemo.deleteMany({ where: { id: memo.id } });
    if (deleted.count === 0) return false;
    await tx.auditLog.create({
      data: {
        userId: actorId,
        action: "DELETE_ADMIN_MEMO",
        targetType: "ADMIN_MEMO",
        targetId: memo.id,
        metadata: {
          previousValue: { kind, key, until: memo.until?.toISOString() ?? null },
          newValue: null,
          details: auditDetails(options, at),
          ...options.auditMeta,
        } as Prisma.InputJsonValue,
      },
    });
    return true;
  });
  if (removed) revalidateAdmin();
  return removed;
}

/** Snoozes a decision (by its key) until a date; it returns to the pile then. */
export function later(key: string, until: Date, actorId: string, options: MemoOptions = {}) {
  return writeMemo("later", key, until, actorId, options);
}

/** Returns a snoozed decision to the pile now. False when it was not snoozed. */
export function bringBack(key: string, actorId: string, options: MemoOptions = {}): Promise<boolean> {
  return removeMemo("later", key, actorId, options);
}

/** Remembers that two events, or two places, are different, so the pair is never offered again. */
export function dismissPair(kind: "not-same-event" | "not-same-place", a: string, b: string, actorId: string, options: MemoOptions = {}) {
  return writeMemo(kind, pairKey(a, b), null, actorId, options);
}

/** Remembers that two places are one, for the duplicate finder. */
export function samePlace(a: string, b: string, actorId: string, options: MemoOptions = {}) {
  return writeMemo("same-place", pairKey(a, b), null, actorId, options);
}

/** Forgets a pair memo, so the pair can be offered again. False when there was none. */
export function forgetPair(kind: Exclude<MemoKind, "later">, a: string, b: string, actorId: string, options: MemoOptions = {}): Promise<boolean> {
  return removeMemo(kind, pairKey(a, b), actorId, options);
}

/** Snoozed decision keys that have not come back yet. */
export async function getSnoozed(now: Date = new Date()): Promise<{ key: string; until: Date }[]> {
  const rows = await db.adminMemo.findMany({
    where: { kind: "later", until: { gt: now } },
    select: { key: true, until: true },
    orderBy: { until: "asc" },
  });
  return rows.map((r) => ({ key: r.key, until: r.until! }));
}

/** The pair keys of one memo kind. */
export async function getPairKeys(kind: Exclude<MemoKind, "later">): Promise<Set<string>> {
  const rows = await db.adminMemo.findMany({ where: { kind }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

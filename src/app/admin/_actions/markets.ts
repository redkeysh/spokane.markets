"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { decisionDetails } from "@/lib/admin/decision-details";
import { formatDay, pacificDate } from "@/lib/admin/format";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { newDecisionId, undoDecision } from "@/lib/admin/undo";
import { EventMutationError, setEventStatuses, updateEventFields } from "@/lib/events/mutations";
import { eventLocalDates } from "@/lib/events/readiness";
import { assertListingCommunityBadgeIds } from "@/lib/listing-community-badges";
import { makeMarketFromEvents } from "@/lib/markets/make-from-events";
import { createMarketDates } from "@/lib/markets/create-dates";
import { DatePatternError, datesForPattern, isNewDateStatus, planNextSeason, type DatePattern, type NewDateStatus } from "@/lib/markets/dates";
import { changedKeys, marketDetailsFrom, normalizeMarketLinks, type MarketDetails } from "@/lib/markets/details";
import { toBoardEvent, BOARD_EVENT_SELECT } from "@/lib/markets/queries";
import { nextDateOnSite } from "@/lib/markets/next-date";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { createNotification } from "@/lib/notifications";
import { marketSchema } from "@/lib/validations";

export type MarketActionResult =
  | {
      ok: true;
      message: string;
      /** Undo for this change goes through undoMarketChange. */
      decisionId?: string;
      /** Events that went live, for the rail fill. */
      publishedIds?: string[];
      marketId?: string;
    }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof MarketDetails, string>> };

function failure(err: unknown): MarketActionResult {
  if (err instanceof EventMutationError || err instanceof DatePatternError) return { ok: false, error: err.message };
  console.error("[admin/markets]", err);
  return { ok: false, error: "That did not work. Nothing was changed. Try again." };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

type Hours = { startTime?: string; endTime?: string; allDay?: boolean };

const BAD_STATUS: MarketActionResult = { ok: false, error: "New dates are either Draft or Published. Nothing was created." };

/** Creates one listing per date of a pattern for a market. */
export async function addMarketDates(input: {
  marketId: string;
  copyFromEventId: string | null;
  pattern: DatePattern;
  hours: Hours;
  status: NewDateStatus;
}): Promise<MarketActionResult & { skipped?: string[] }> {
  const session = await requireAdminAction();
  if (!isNewDateStatus(input.status)) return BAD_STATUS;
  try {
    const dates = datesForPattern(input.pattern);
    const decisionId = newDecisionId();
    const { created, skipped } = await createMarketDates(
      input.marketId,
      { dates: dates.map((date) => ({ date, ...input.hours })), copyFromEventId: input.copyFromEventId, status: input.status },
      session.user.id,
      { decisionId }
    );
    revalidateAdmin();
    if (created.length === 0) return { ok: false, error: "Every one of those dates is already listed. Nothing was created." };
    const kind = input.status === "PUBLISHED" ? "published" : "draft";
    const skippedText = skipped.length ? ` ${count(skipped.length, "date was", "dates were")} already listed and left out.` : "";
    return {
      ok: true,
      message: `Created ${created.length} ${kind} ${created.length === 1 ? "date" : "dates"}.${skippedText}`,
      decisionId,
      publishedIds: input.status === "PUBLISHED" ? created.map((c) => c.id) : [],
      skipped,
    };
  } catch (err) {
    return failure(err);
  }
}

async function marketListings(marketId: string) {
  const rows = await db.event.findMany({ where: { marketId, deletedAt: null }, select: BOARD_EVENT_SELECT });
  return rows.map(toBoardEvent);
}

/**
 * Last season moved 52 weeks. `fromEventIds` limits it to some listings ("Repeat for 2027 as
 * weekly dates"); `dates` to the ones left ticked.
 */
export async function repeatLastSeason(input: {
  marketId: string;
  status: NewDateStatus;
  dates?: string[];
  fromEventIds?: string[];
}): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  if (!isNewDateStatus(input.status)) return BAD_STATUS;
  try {
    const own = await marketListings(input.marketId);
    const now = new Date();
    const today = pacificDate(now);
    const sources = input.fromEventIds?.length ? own.filter((e) => input.fromEventIds!.includes(e.id)) : own;
    const taken = own.filter((e) => e.status !== "REJECTED" && e.status !== "CANCELLED").flatMap((e) => eventLocalDates(e));
    const wanted = input.dates ? new Set(input.dates) : null;
    const plan = planNextSeason(sources, today, taken).filter((p) => !wanted || wanted.has(p.date));
    if (plan.length === 0) return { ok: false, error: "There are no dates from last season left to repeat." };
    const decisionId = newDecisionId();
    const { created } = await createMarketDates(
      input.marketId,
      {
        dates: plan.map((p) => ({ date: p.date, startTime: p.startTime, endTime: p.endTime, allDay: p.allDay, sourceEventId: p.sourceEventId })),
        status: input.status,
      },
      session.user.id,
      { decisionId }
    );
    revalidateAdmin();
    const kind = input.status === "PUBLISHED" ? "published" : "draft";
    return {
      ok: true,
      message: `Created ${created.length} ${kind} ${created.length === 1 ? "date" : "dates"} for next season.`,
      decisionId,
      publishedIds: input.status === "PUBLISHED" ? created.map((c) => c.id) : [],
    };
  } catch (err) {
    return failure(err);
  }
}

/** Publishes a market's waiting dates in one undoable decision. */
export async function publishMarketDates(input: { marketId: string; eventIds: string[] }): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const market = await db.market.findFirst({ where: { id: input.marketId, deletedAt: null }, select: { id: true, name: true, slug: true } });
    if (!market) return { ok: false, error: "This market does not exist or is archived." };
    const mine = await db.event.findMany({
      where: { id: { in: input.eventIds }, marketId: market.id, deletedAt: null },
      select: { id: true },
    });
    if (mine.length === 0) return { ok: false, error: "None of those dates belong to this market any more." };
    const decisionId = newDecisionId();
    const result = await setEventStatuses(
      mine.map((e) => e.id),
      "PUBLISHED",
      session.user.id,
      { decisionId }
    );
    revalidateAdmin({ marketSlugs: [market.slug] });

    const own = await marketListings(market.id);
    const next = nextDateOnSite(own, new Date());
    const parts = [`Published ${result.changed.length}.`];
    if (result.alreadyThere.length) parts.push(`${count(result.alreadyThere.length, "was", "were")} already live.`);
    if (result.refused.length) parts.push(`${count(result.refused.length, "was", "were")} left waiting: ${result.refused[0].reason}`);
    if (result.notified.length) parts.push(`${result.notified.join(" and ")} ${result.notified.length === 1 ? "was" : "were"} told.`);
    if (next) parts.push(`Its next date on the site is ${formatDay(pacificDate(next.startDate))}.`);
    if (result.changed.length === 0) return { ok: false, error: parts.join(" ") };
    return { ok: true, message: parts.join(" "), decisionId, publishedIds: result.changed };
  } catch (err) {
    return failure(err);
  }
}

/** Undoes a publish, a link or a new market made from these screens. */
export async function undoMarketChange(decisionId: string): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const result = await undoDecision(decisionId, session.user.id);
    revalidateAdmin();
    return result.ok ? { ok: true, message: result.message } : { ok: false, error: result.message };
  } catch (err) {
    return failure(err);
  }
}

/** Links listings that look like a market's own to it, in one undoable decision. */
export async function linkDatesToMarket(input: { marketId: string; eventIds: string[] }): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const market = await db.market.findFirst({ where: { id: input.marketId, deletedAt: null }, select: { id: true, name: true, slug: true } });
    if (!market) return { ok: false, error: "This market does not exist or is archived." };
    const ids = [...new Set(input.eventIds)];
    const rows = await db.event.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, title: true, marketId: true } });
    if (rows.length < ids.length) return { ok: false, error: "One of those dates was archived or no longer exists. Nothing was linked." };
    const taken = rows.find((e) => e.marketId && e.marketId !== market.id);
    if (taken) return { ok: false, error: `${taken.title} already belongs to another market. Nothing was linked.` };
    const todo = rows.filter((e) => e.marketId !== market.id).map((e) => e.id);
    if (todo.length === 0) return { ok: true, message: `Those dates are already linked to ${market.name}.` };

    const decisionId = newDecisionId();
    const linked: string[] = [];
    let stopped: unknown = null;
    for (const id of todo) {
      try {
        await updateEventFields(id, { marketId: market.id }, session.user.id, { decisionId });
        linked.push(id);
      } catch (err) {
        stopped = err;
        break;
      }
    }
    if (linked.length > 0) revalidateAdmin({ marketSlugs: [market.slug] });
    if (stopped) {
      if (linked.length === 0) return failure(stopped);
      if (!(stopped instanceof EventMutationError)) console.error("[admin/markets]", stopped);
      const reason = stopped instanceof EventMutationError ? stopped.message : "The rest were not linked. Try again.";
      return { ok: true, message: `Linked ${linked.length} of ${todo.length} to ${market.name}. ${reason}`, decisionId };
    }
    return { ok: true, message: `Linked ${count(linked.length, "date", "dates")} to ${market.name}.`, decisionId };
  } catch (err) {
    return failure(err);
  }
}

/** "Make a market": a market from repeating listings, all of them linked, in one undoable step. */
export async function makeMarketFromDates(input: {
  eventIds: string[];
  name: string;
  venueId: string;
  typicalSchedule: string | null;
}): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    if (!input.name.trim()) return { ok: false, error: "Give the market a name." };
    const decisionId = newDecisionId();
    const made = await makeMarketFromEvents(
      input.eventIds,
      { name: input.name.trim(), venueId: input.venueId, typicalSchedule: input.typicalSchedule?.trim() || null },
      session.user.id,
      { decisionId }
    );
    revalidateAdmin({ marketSlugs: [made.slug] });
    return {
      ok: true,
      message: `Made the market ${input.name.trim()} and linked ${count(made.linked.length, "date", "dates")}.`,
      decisionId,
      marketId: made.marketId,
    };
  } catch (err) {
    return failure(err);
  }
}

/** "Repeat for 2027" on listings with no market: makes the market, then adds next season's dates to it. */
export async function makeMarketAndRepeat(input: {
  eventIds: string[];
  name: string;
  venueId: string;
  typicalSchedule: string | null;
  status: NewDateStatus;
}): Promise<MarketActionResult> {
  if (!isNewDateStatus(input.status)) {
    await requireAdminAction();
    return BAD_STATUS;
  }
  const made = await makeMarketFromDates(input);
  if (!made.ok || !made.marketId) return made;
  const repeated = await repeatLastSeason({ marketId: made.marketId, status: input.status, fromEventIds: input.eventIds });
  if (!repeated.ok) return { ok: true, message: `${made.message} No dates were added: ${repeated.error}`, marketId: made.marketId };
  return { ok: true, message: `${made.message} ${repeated.message}`, marketId: made.marketId, publishedIds: repeated.publishedIds };
}

const VERIFICATION_WORDS = { VERIFIED: "verified", PENDING: "waiting for verification", UNVERIFIED: "not verified" } as const;

/** Sets a market's verification after the owner confirmed its consequence; tells the market's people when it becomes verified. */
export async function setMarketVerification(input: {
  marketId: string;
  status: "UNVERIFIED" | "PENDING" | "VERIFIED";
  /** Groups the change into a To do decision, which Undo can reverse. */
  decision?: { decisionId: string; decisionKey?: string };
}): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const market = await db.market.findFirst({
      where: { id: input.marketId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        verificationStatus: true,
        memberships: { where: { role: { in: ["OWNER", "MANAGER"] } }, select: { userId: true } },
      },
    });
    if (!market) return { ok: false, error: "This market does not exist or is archived." };
    if (market.verificationStatus === input.status) {
      return { ok: true, message: `${market.name} is already ${VERIFICATION_WORDS[input.status]}.` };
    }
    const at = new Date();
    await db.$transaction([
      db.market.update({
        where: { id: market.id },
        data: {
          verificationStatus: input.status,
          verificationReviewedAt: at,
          verificationReviewedBy: session.user.id,
        },
      }),
      db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_MARKET",
          targetType: "MARKET",
          targetId: market.id,
          metadata: {
            previousValue: { verificationStatus: market.verificationStatus },
            newValue: { verificationStatus: input.status },
            details: { ...decisionDetails(input.decision ?? {}), title: market.name, at: at.toISOString() },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    let told = 0;
    if (input.status === "VERIFIED") {
      const recipients = new Set([market.ownerId, ...market.memberships.map((m) => m.userId)].filter((id): id is string => !!id));
      for (const userId of recipients) {
        try {
          await createNotification({
            userId,
            type: "MARKET_VERIFIED",
            title: `Your market ${market.name} is now verified`,
            link: `/markets/${market.slug}`,
            objectType: "market",
            objectId: market.id,
          });
          told += 1;
        } catch (err) {
          console.error(`[admin/markets] telling ${userId} about ${market.id} failed:`, err);
        }
      }
    }
    revalidateAdmin({ marketSlugs: [market.slug] });
    const toldText = told ? ` ${count(told, "person was", "people were")} told.` : "";
    return {
      ok: true,
      message: `${market.name} is now ${VERIFICATION_WORDS[input.status]}.${toldText}`,
      ...(input.decision ? { decisionId: input.decision.decisionId } : {}),
    };
  } catch (err) {
    return failure(err);
  }
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]): Partial<Record<keyof MarketDetails, string>> {
  const out: Partial<Record<keyof MarketDetails, string>> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "") as keyof MarketDetails;
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002";
}

/** Creates a market (id null) or saves its details, with an audit entry naming the changed fields. */
export async function saveMarketDetails(input: { id: string | null; values: MarketDetails }): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  const values = normalizeMarketLinks(input.values);
  const parsed = marketSchema.safeParse({
    ...values,
    baseArea: values.baseArea || undefined,
    contactEmail: values.contactEmail.trim(),
  });
  if (!parsed.success) {
    return { ok: false, error: "Some fields need a look before saving.", fieldErrors: fieldErrorsOf(parsed.error.issues) };
  }
  try {
    const badgeIds = await assertListingCommunityBadgeIds(values.listingCommunityBadgeIds);
    const baseArea = await assertNeighborhoodSlug(values.baseArea || null, "neighborhood");
    const venue = await db.venue.findFirst({ where: { id: values.venueId, deletedAt: null }, select: { id: true } });
    if (!venue) return { ok: false, error: "Pick a home place that is not archived.", fieldErrors: { venueId: "Pick a place that is not archived." } };
    if (values.ownerId) {
      const owner = await db.user.findUnique({ where: { id: values.ownerId }, select: { id: true } });
      if (!owner) return { ok: false, error: "That owner's account no longer exists.", fieldErrors: { ownerId: "Pick another account." } };
    }

    const data = {
      name: values.name.trim(),
      slug: values.slug.trim(),
      venueId: values.venueId,
      baseArea,
      typicalSchedule: values.typicalSchedule.trim() || null,
      description: values.description.trim() || null,
      contactEmail: values.contactEmail.trim() || null,
      contactPhone: values.contactPhone.trim() || null,
      ownerId: values.ownerId || null,
      participationMode: values.participationMode,
      vendorCapacity: values.vendorCapacity,
      publicIntentListEnabled: values.publicIntentListEnabled,
      publicIntentNamesEnabled: values.publicIntentNamesEnabled,
      publicRosterEnabled: values.publicRosterEnabled,
      vendorWorkflowMode: values.vendorWorkflowMode,
      vendorApplicationState: values.vendorApplicationState,
      imageUrl: values.imageUrl.trim() || null,
      imageFocalX: values.imageFocalX,
      imageFocalY: values.imageFocalY,
      websiteUrl: values.websiteUrl || null,
      facebookUrl: values.facebookUrl || null,
      instagramUrl: values.instagramUrl || null,
      complianceFlagged: values.complianceFlagged,
      complianceNotes: values.complianceNotes.trim() || null,
    };
    const at = new Date();

    if (!input.id) {
      const created = await db.$transaction(async (tx) => {
        const market = await tx.market.create({
          data: { ...data, listingCommunityBadges: { connect: badgeIds.map((id) => ({ id })) } },
          select: { id: true, name: true, slug: true },
        });
        await tx.auditLog.create({
          data: {
            userId: session.user.id,
            action: "CREATE_MARKET",
            targetType: "MARKET",
            targetId: market.id,
            metadata: {
              newValue: { name: market.name, slug: market.slug, venueId: data.venueId, typicalSchedule: data.typicalSchedule },
              details: { title: market.name, at: at.toISOString() },
            } as Prisma.InputJsonValue,
          },
        });
        return market;
      });
      revalidateAdmin({ marketSlugs: [created.slug] });
      return { ok: true, message: `Made the market ${created.name}.`, marketId: created.id };
    }

    const existing = await db.market.findFirst({
      where: { id: input.id, deletedAt: null },
      include: { listingCommunityBadges: { select: { id: true } } },
    });
    if (!existing) return { ok: false, error: "This market does not exist or is archived." };
    const before = marketDetailsFrom(existing);
    const after: MarketDetails = { ...values, baseArea: baseArea ?? "", listingCommunityBadgeIds: badgeIds };
    const changed = changedKeys(before, after);
    if (changed.length === 0) return { ok: true, message: "Nothing to save.", marketId: existing.id };

    await db.$transaction([
      db.market.update({
        where: { id: existing.id },
        data: { ...data, listingCommunityBadges: { set: badgeIds.map((id) => ({ id })) } },
      }),
      db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "UPDATE_MARKET",
          targetType: "MARKET",
          targetId: existing.id,
          metadata: {
            previousValue: Object.fromEntries(changed.map((key) => [key, before[key]])),
            newValue: Object.fromEntries(changed.map((key) => [key, after[key]])),
            details: { title: data.name, at: at.toISOString() },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateAdmin({ marketSlugs: [...new Set([existing.slug, data.slug])] });
    return { ok: true, message: `Saved ${count(changed.length, "change", "changes")} to ${data.name}.`, marketId: existing.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Another market already uses this web address.", fieldErrors: { slug: "Another market already uses this web address." } };
    }
    if (err instanceof Error && /badge|slug/i.test(err.message)) return { ok: false, error: err.message };
    return failure(err);
  }
}

/** Archives a market: it leaves the site and every list, and can be restored. Its dates stay as they are. */
export async function archiveMarket(marketId: string): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const market = await db.market.findFirst({ where: { id: marketId, deletedAt: null }, select: { id: true, name: true, slug: true } });
    if (!market) return { ok: false, error: "This market is already archived." };
    const at = new Date();
    await db.$transaction([
      db.market.update({ where: { id: market.id }, data: { deletedAt: at } }),
      db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SOFT_DELETE_MARKET",
          targetType: "MARKET",
          targetId: market.id,
          metadata: {
            previousValue: { deletedAt: null },
            newValue: { deletedAt: at.toISOString() },
            details: { title: market.name, at: at.toISOString() },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateAdmin({ marketSlugs: [market.slug] });
    return { ok: true, message: `Archived ${market.name}.`, marketId: market.id };
  } catch (err) {
    return failure(err);
  }
}

export async function restoreMarket(marketId: string): Promise<MarketActionResult> {
  const session = await requireAdminAction();
  try {
    const market = await db.market.findFirst({
      where: { id: marketId, deletedAt: { not: null } },
      select: { id: true, name: true, slug: true, deletedAt: true },
    });
    if (!market) return { ok: false, error: "This market is not archived." };
    const at = new Date();
    await db.$transaction([
      db.market.update({ where: { id: market.id }, data: { deletedAt: null } }),
      db.auditLog.create({
        data: {
          userId: session.user.id,
          action: "RESTORE_MARKET",
          targetType: "MARKET",
          targetId: market.id,
          metadata: {
            previousValue: { deletedAt: market.deletedAt?.toISOString() ?? null },
            newValue: { deletedAt: null },
            details: { title: market.name, at: at.toISOString() },
          } as Prisma.InputJsonValue,
        },
      }),
    ]);
    revalidateAdmin({ marketSlugs: [market.slug] });
    return { ok: true, message: `Restored ${market.name}.`, marketId: market.id };
  } catch (err) {
    return failure(err);
  }
}

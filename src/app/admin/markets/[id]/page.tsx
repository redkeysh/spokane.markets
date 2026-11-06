import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatDay, pacificDate } from "@/lib/admin/format";
import { adminRecordTitle } from "@/lib/admin/record-title";
import { toHistoryEntries } from "@/lib/admin/history";
import { decisionIdOf, undoability } from "@/lib/admin/undo";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { getNeighborhoodOptions } from "@/lib/neighborhoods";
import { typicalScheduleFrom } from "@/lib/markets/make-from-events";
import { planNextSeason } from "@/lib/markets/dates";
import { marketDetailsFrom } from "@/lib/markets/details";
import {
  aheadDays,
  describePlan,
  findLookAlikes,
  isAhead,
  marketNotes,
  seasonsOf,
  withListingDays,
  type BoardMarket,
} from "@/lib/markets/board";
import { nextDateSentence, summarizeNextDate, waitingAhead } from "@/lib/markets/next-date";
import { checkTypicalSchedule } from "@/lib/markets/schedule-check";
import { changeDetails, copyChoices, firstFreeDay, historyDay, seasonRows, takenDates } from "@/lib/markets/page-view";
import { loadMarketEvents, loadMarketRecord, loadPlaceOptions } from "@/lib/markets/queries";
import { MarketPage, type MarketPageData } from "@/components/admin/markets/market-page";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return adminRecordTitle("Market", async () => (await db.market.findUnique({ where: { id }, select: { name: true } }))?.name);
}

const HISTORY_LIMIT = 8;

async function marketHistory(marketId: string, viewerId: string, today: string) {
  const rows = await db.auditLog.findMany({
    where: { targetType: "MARKET", targetId: marketId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: { id: true, userId: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  const decisionIds = [...new Set(rows.map(decisionIdOf).filter((id): id is string => !!id))];
  const entries = toHistoryEntries(rows, viewerId, await undoability(decisionIds));
  const undoable: Record<string, string> = {};
  const list = entries.map((entry) => {
    if (entry.canUndo && entry.decisionId) undoable[entry.id] = entry.decisionId;
    return {
      id: entry.id,
      day: historyDay(pacificDate(entry.at), today),
      at: entry.at.toISOString(),
      time: entry.time,
      timestamp: entry.timestamp,
      sentence: entry.sentence,
      details: changeDetails(entry.previousValue, entry.newValue),
      canUndo: entry.canUndo,
    };
  });
  return { list, undoable };
}

export default async function MarketPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ add?: string | string[] }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const { add } = await searchParams;
  const record = await loadMarketRecord(id);
  if (!record) notFound();

  const now = new Date();
  const today = pacificDate(now);
  const [{ own, unlinked, groups }, places, neighborhoods, badges, history] = await Promise.all([
    loadMarketEvents(id, now),
    loadPlaceOptions(),
    getNeighborhoodOptions(),
    getListingCommunityBadgeOptions(),
    marketHistory(id, session.user.id, today),
  ]);

  const market: BoardMarket = {
    id: record.id,
    name: record.name,
    slug: record.slug,
    verificationStatus: record.verificationStatus,
    deletedAt: record.deletedAt,
    typicalSchedule: record.typicalSchedule,
    venue: record.venue,
  };
  const lookAlikes = record.deletedAt ? [] : findLookAlikes(market, own, unlinked, groups, today);
  const notes = marketNotes(market, own, lookAlikes, groups, now);
  const ahead = own.filter((e) => isAhead(e, today));
  const taken = takenDates(own);
  const plan = planNextSeason(own, today, taken);
  const check = checkTypicalSchedule(record.typicalSchedule, aheadDays(ahead, today));
  const suggestion = ahead.length ? typicalScheduleFrom(ahead.map(withListingDays)) : null;
  const people = new Map<string, string>();
  if (record.owner) people.set(record.owner.id, record.owner.name?.trim() || record.owner.email.split("@")[0]);
  for (const m of record.memberships) {
    if (m.role === "OWNER" || m.role === "MANAGER") people.set(m.user.id, m.user.name?.trim() || m.user.email.split("@")[0]);
  }
  const v = record.venue;

  const data: MarketPageData = {
    market: {
      id: record.id,
      name: record.name,
      archived: !!record.deletedAt,
      verification: record.verificationStatus,
      publicHref: record.deletedAt ? null : `/markets/${record.slug}`,
      home: [v.name, v.address, v.city].filter(Boolean).join(", "),
      homeId: v.id,
      homeArchived: !!v.deletedAt,
      updatedAt: record.updatedAt.toISOString(),
    },
    nextSentence: nextDateSentence(summarizeNextDate(own, now), now),
    notes,
    lookAlikeIds: lookAlikes.map((e) => e.id),
    scheduleCheck: check?.message ?? null,
    scheduleSuggestion: suggestion && suggestion !== record.typicalSchedule ? suggestion : null,
    seasons: seasonRows(seasonsOf(own, now), market, own, now),
    waiting: waitingAhead(own, now).map((e) => ({ id: e.id, title: e.title, day: formatDay(pacificDate(e.startDate), now) })),
    openAdd: (Array.isArray(add) ? add[0] : add) === "1",
    plan,
    planSummary: describePlan(plan.map((p) => p.date), now),
    sources: copyChoices(own, now),
    taken,
    firstFree: firstFreeDay(own, today),
    today,
    nowIso: now.toISOString(),
    details: marketDetailsFrom(record),
    ownerDisplay: record.owner ? record.owner.name || record.owner.email : "",
    team: record.memberships.map((m) => ({ name: m.user.name?.trim() || m.user.email, role: m.role })),
    toldOnVerify: [...people.values()],
    options: {
      places: places.map((p) => ({ id: p.id, name: p.name, city: p.city })),
      neighborhoods,
      badges: badges.map((b) => ({ id: b.id, name: b.name, description: b.description })),
    },
    history: history.list,
    undoable: history.undoable,
  };

  return <MarketPage data={data} />;
}

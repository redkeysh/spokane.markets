import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { FilterBar, FilterLinkSelect, FilterSearch } from "@/components/admin/kit/filter-bar";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { Segmented } from "@/components/admin/kit/segmented";
import { MarketsBoard } from "@/components/admin/markets/markets-board";
import { UnlinkedSeries } from "@/components/admin/markets/unlinked-series";
import {
  boardRowView,
  buildMarketRows,
  filterCounts,
  findRepeatsWithoutMarket,
  repeatView,
  rowMatches,
  type BoardFilter,
  type MarketRow,
} from "@/lib/markets/board";
import { loadBoard, loadPlaceOptions } from "@/lib/markets/queries";

export const metadata: Metadata = { title: "Markets" };

export const dynamic = "force-dynamic";

const FILTERS: { value: BoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "waiting", label: "Dates waiting" },
  { value: "nothing-ahead", label: "Nothing ahead" },
  { value: "not-verified", label: "Not verified" },
  { value: "archived", label: "Archived" },
];

const EMPTY: Record<BoardFilter, string> = {
  all: "No markets yet.",
  waiting: "No market has dates waiting.",
  "nothing-ahead": "Every market has a date ahead.",
  "not-verified": "Every market is verified.",
  archived: "No archived markets.",
};

function parseFilter(value: string | undefined, archived: string | undefined): BoardFilter {
  if (archived === "1" || archived === "true") return "archived";
  return FILTERS.some((f) => f.value === value) ? (value as BoardFilter) : "all";
}

function hrefFor(filter: BoardFilter, q: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("show", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/admin/markets?${qs}` : "/admin/markets";
}

function matchesQuery(name: string, place: string, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return name.toLowerCase().includes(needle) || place.toLowerCase().includes(needle);
}

export default async function MarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; q?: string; archived?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter = parseFilter(params.show, params.archived);
  const q = (params.q ?? "").trim().slice(0, 100);
  const now = new Date();

  const [{ markets, events, groups }, places] = await Promise.all([loadBoard(now), loadPlaceOptions()]);
  const { window, rows, claimed } = buildMarketRows(markets, events, groups, now);
  const counts = filterCounts(rows);
  const matching = rows.filter((r: MarketRow) => rowMatches(r, filter) && matchesQuery(r.market.name, r.market.venue.name, q));
  const views = matching.map((r) => boardRowView(r, window, now));
  const repeats =
    filter === "all"
      ? findRepeatsWithoutMarket(events, groups, now, claimed)
          .filter((g) => matchesQuery(g.name, g.events[0]?.venueName ?? "", q))
          .map((g) => repeatView(g, now))
      : [];
  const scale = { months: window.months, todayX: window.todayX };
  const filtered = filter !== "all" || q !== "";
  const emptyText = q ? (
    <>
      No {filter === "all" ? "" : `${FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} `}markets match &ldquo;{q}&rdquo;.{" "}
      <Link href={hrefFor(filter, "")} className="text-lilac underline-offset-4 hover:underline">
        Clear search
      </Link>
    </>
  ) : (
    EMPTY[filter]
  );

  return (
    <Screen>
      <Pane label="Markets" className="h-full lg:px-6 lg:pt-0">
        <div className="mx-auto max-w-[1392px] space-y-4 lg:pt-5">
          <PageHeader
            title="Markets"
            actions={
              <AdminLinkButton href="/admin/markets/new" variant="outline">
                New market
              </AdminLinkButton>
            }
          />
          <FilterBar label="Filter markets" active={filtered} clearHref="/admin/markets">
            <form role="search" action="/admin/markets" className="w-full sm:w-auto">
              {filter !== "all" && <input type="hidden" name="show" value={filter} />}
              <FilterSearch name="q" label="Search markets" placeholder="Search market or place" defaultValue={q} />
            </form>
            <span className="hidden flex-wrap items-center gap-2 md:inline-flex">
              <span aria-hidden="true" className="font-text text-sm text-ash">
                Show
              </span>
              <Segmented<BoardFilter>
                label="Show"
                value={filter}
                className="h-auto flex-wrap"
                options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value], href: hrefFor(f.value, q) }))}
              />
            </span>
            <FilterLinkSelect
              label="Show"
              value={filter}
              className="md:hidden"
              options={FILTERS.map((f) => ({ value: f.value, label: `${f.label}, ${counts[f.value]}`, href: hrefFor(f.value, q) }))}
            />
          </FilterBar>
          <MarketsBoard rows={views} scale={scale} nowIso={now.toISOString()} fold={!filtered} emptyText={emptyText} />
          <UnlinkedSeries groups={repeats} scale={scale} places={places} />
        </div>
      </Pane>
    </Screen>
  );
}

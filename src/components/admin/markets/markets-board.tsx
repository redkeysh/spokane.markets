"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { DateLeaf } from "@/components/admin/kit/date-leaf";
import { Empty } from "@/components/admin/kit/empty";
import { List } from "@/components/admin/kit/list";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { StallGlyph } from "@/components/admin/kit/stall";
import type { BoardRowView, RowAction } from "@/lib/markets/board";
import { archiveMarket, linkDatesToMarket, publishMarketDates, restoreMarket } from "@/app/admin/_actions/markets";
import { MonthScale, SeasonLane, type LaneScale } from "./season-lane";
import { NextSeason } from "./next-season";
import { CONFIRM_OVER, PublishConfirm } from "./publish-confirm";
import { useMarketAction } from "./use-market-action";

/** Columns shared by the month scale and every lane row, so the today line lines up. */
export const LANE_GRID = "md:grid md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,11rem)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,13rem)] md:gap-x-5";

/** Moves focus to a row that a "Show" button is about to reveal, once it is rendered. */
export function focusRowSoon(rowKey: string) {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(rowKey)}"]`)?.focus();
  });
}

const NEXT_TONE = {
  live: "text-cedar",
  waiting: "text-honey-ink",
  none: "text-ash",
} as const;

export function LaneHeader({ scale, label }: { scale: LaneScale; label: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(LANE_GRID, "sticky top-[var(--sm-sticky-top)] z-10 hidden items-end border-b border-seam bg-sheet px-4 py-1.5")}
    >
      <span />
      <MonthScale scale={scale} />
      <span className="text-right text-xs text-ash">{label}</span>
    </div>
  );
}

function ActionButton({
  action,
  row,
  busy,
  onPublish,
  onLink,
  onRepeat,
  repeating,
}: {
  action: RowAction;
  row: BoardRowView;
  busy: string | null;
  onPublish: () => void;
  onLink: (ids: string[]) => void;
  onRepeat: () => void;
  repeating: boolean;
}) {
  switch (action.kind) {
    case "fix-place":
    case "review":
    case "add":
      return (
        <AdminLinkButton href={action.href} size="sm" variant="outline">
          {action.label}
        </AdminLinkButton>
      );
    case "publish":
      return (
        <AdminButton size="sm" variant="outline" busy={busy === `publish:${row.id}`} busyLabel="Publishing" onClick={onPublish}>
          {action.label}
        </AdminButton>
      );
    case "link":
      return (
        <AdminButton size="sm" variant="outline" busy={busy === `link:${row.id}`} busyLabel="Linking" onClick={() => onLink(action.eventIds)}>
          {action.label}
        </AdminButton>
      );
    case "repeat":
      return (
        <AdminButton size="sm" variant="outline" aria-expanded={repeating} onClick={onRepeat}>
          {action.label}
        </AdminButton>
      );
  }
}

function MarketRowItem({ row, scale, now }: { row: BoardRowView; scale: LaneScale; now: Date }) {
  const { run, busy } = useMarketAction();
  const [repeating, setRepeating] = React.useState(false);
  const [preview, setPreview] = React.useState<string[]>([]);
  const [confirming, setConfirming] = React.useState(false);
  const srId = React.useId();
  const repeatButton = React.useRef<HTMLDivElement>(null);

  const publish = () => {
    const ids = row.waiting.map((w) => w.id);
    void run(`publish:${row.id}`, () => publishMarketDates({ marketId: row.id, eventIds: ids }));
  };
  const askPublish = () => (row.waiting.length > CONFIRM_OVER ? setConfirming(true) : publish());
  const link = (eventIds: string[]) => void run(`link:${row.id}`, () => linkDatesToMarket({ marketId: row.id, eventIds }));
  const onPreview = React.useCallback((dates: string[]) => setPreview(dates), []);
  const closeRepeat = () => {
    setRepeating(false);
    repeatButton.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };

  const [primary, ...rest] = row.actions;
  const menu: MenuItem[] = [
    { label: "Open", href: row.href },
    ...rest.map((a): MenuItem => {
      switch (a.kind) {
        case "fix-place":
        case "review":
        case "add":
          return { label: a.label, href: a.href };
        case "publish":
          return { label: a.label, description: "Puts the waiting dates on the site.", onSelect: askPublish };
        case "link":
          return { label: a.label, onSelect: () => link(a.eventIds) };
        case "repeat":
          return { label: a.label, description: "Shows next season's dates before creating them.", onSelect: () => setRepeating(true) };
      }
    }),
    ...(row.publicHref ? [{ label: "View on site", href: row.publicHref, external: true }] : []),
    row.archived
      ? { label: "Restore", onSelect: () => void run(`restore:${row.id}`, () => restoreMarket(row.id)) }
      : { label: "Archive", description: "Off the site and out of every list. Can be restored.", danger: true, onSelect: () => void run(`archive:${row.id}`, () => archiveMarket(row.id)) },
  ];
  const previewX = repeating ? row.planX.filter((p) => preview.includes(p.date)) : undefined;

  return (
    <li className={cn("sm-row border-b border-seam bg-sheet px-4 py-2.5 hover:bg-hover", LANE_GRID, "md:gap-y-1", row.archived && "text-ash-quiet")}>
      <div className="min-w-0 md:col-start-1 md:row-start-1">
        <Link
          href={row.href}
          data-roving-item
          data-row-key={row.id}
          aria-describedby={srId}
          className={cn("sm-row-link block text-sm font-medium", row.archived ? "text-ash-quiet" : "text-basalt")}
        >
          {row.name}
        </Link>
        <span id={srId} className="sr-only">
          {row.srSummary}
        </span>
      </div>
      <SeasonLane lane={row.lane} scale={scale} preview={previewX} className="hidden md:col-start-2 md:row-start-1 md:block" />
      <p className={cn("mt-0.5 text-sm tabular-nums md:col-start-3 md:row-start-1 md:mt-0 md:self-center md:text-right", NEXT_TONE[row.nextTone])}>
        <span className="text-ash md:sr-only">Next date on the site: </span>
        {row.nextText}
      </p>
      <p className="mt-0.5 min-w-0 text-xs text-ash md:col-span-2 md:col-start-1 md:row-start-2 md:mt-0">
        {[row.meta, row.note].filter(Boolean).join(". ")}
        {row.archived && <span>. Archived</span>}
      </p>
      {row.nextThree.length > 0 && (
        <ul aria-label="Next dates" className="mt-2 flex gap-2 md:hidden">
          {row.nextThree.map((d) => (
            <li key={d.date} className="flex flex-col items-center gap-1">
              <DateLeaf date={d.date} />
              <StallGlyph status={d.status} size="sm" />
            </li>
          ))}
        </ul>
      )}
      <div
        ref={repeatButton}
        data-row-action
        className="mt-2 flex items-center gap-1 md:col-start-3 md:row-start-2 md:mt-0 md:justify-end"
      >
        {row.archived ? (
          <AdminButton size="sm" variant="outline" busy={busy === `restore:${row.id}`} busyLabel="Restoring" onClick={() => void run(`restore:${row.id}`, () => restoreMarket(row.id))}>
            Restore
          </AdminButton>
        ) : (
          primary && (
            <ActionButton
              action={primary}
              row={row}
              busy={busy}
              onPublish={askPublish}
              onLink={link}
              onRepeat={() => setRepeating((open) => !open)}
              repeating={repeating}
            />
          )
        )}
        <Menu items={menu} label={`More for ${row.name}`} />
      </div>
      {repeating && (
        <div data-row-action className="mt-3 md:col-span-3 md:row-start-3">
          <NextSeason
            marketId={row.id}
            plan={row.plan}
            summary={row.planSummary}
            headingLevel="h2"
            onPreview={onPreview}
            onClose={closeRepeat}
            now={now}
            className="pb-1"
          />
        </div>
      )}
      <PublishConfirm open={confirming} onOpenChange={setConfirming} marketName={row.name} dates={row.waiting} onConfirm={publish} />
    </li>
  );
}

/**
 * The season lanes: one row per market, the lilac today line across all of them, "Next date on
 * the site" on the right, the obvious next step under it. Markets with no dates at all fold away
 * unless they are verified or a filter is on.
 */
export function MarketsBoard({
  rows,
  scale,
  nowIso,
  fold,
  emptyText,
}: {
  rows: BoardRowView[];
  scale: LaneScale;
  nowIso: string;
  /** Fold markets with no dates under "N more with no dates". */
  fold: boolean;
  emptyText: React.ReactNode;
}) {
  const now = React.useMemo(() => new Date(nowIso), [nowIso]);
  const [showFolded, setShowFolded] = React.useState(false);
  const foldedRows = fold ? rows.filter((r) => r.folded) : [];
  const shown = showFolded || !fold ? rows : rows.filter((r) => !r.folded);

  if (rows.length === 0) return <Empty>{emptyText}</Empty>;

  return (
    <div>
      <LaneHeader scale={scale} label="Next date on the site" />
      <List label="Markets">
        {shown.map((row) => (
          <MarketRowItem key={row.id} row={row} scale={scale} now={now} />
        ))}
      </List>
      {foldedRows.length > 0 && !showFolded && (
        <div className="flex items-center justify-between gap-3 border-b border-seam px-4 py-2.5">
          <p className="text-sm text-ash">
            {foldedRows.length} more with no dates: {foldedRows.slice(0, 3).map((r) => r.name).join(", ")}
            {foldedRows.length > 3 ? ", and others" : ""}.
          </p>
          <AdminButton
            size="sm"
            variant="quiet"
            onClick={() => {
              setShowFolded(true);
              focusRowSoon(foldedRows[0].id);
            }}
          >
            Show
          </AdminButton>
        </div>
      )}
    </div>
  );
}

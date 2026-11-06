"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EventListRow, EventsListFilters, EventsListResult } from "@/lib/admin/events-query";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { BulkBar } from "@/components/admin/kit/bulk-bar";
import { Empty } from "@/components/admin/kit/empty";
import { Menu } from "@/components/admin/kit/menu";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { isTypingTarget, useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useRail } from "@/components/admin/shell/rail-context";
import {
  addTagToEventsAction,
  archiveEventsAction,
  linkEventsToMarketAction,
  publishEventsAction,
  rejectEventsAction,
  restoreEventsAction,
  setEventsPlaceAction,
  undoEventsAction,
  type BulkOutcome,
} from "@/app/admin/_actions/events";
import { ConfirmBulkDialog, PickDialog, RejectDialog, shouldListTitles, type DialogEvent, type PickOption } from "./bulk-dialogs";
import { bulkMessage, railAfterPublish, tellLabel, type BulkVerb } from "./bulk-messages";
import { EventsFilters, ViewControl } from "./events-filters";
import { EventsTable } from "./events-table";
import { EventsListProvider, type EventsListApi } from "./list-context";
import { useListKeys } from "./use-list-keys";
import { WeekendGroup } from "./weekend-group";

type Dialog =
  | { kind: "publish"; ids: string[] }
  | { kind: "archive"; ids: string[] }
  | { kind: "reject"; ids: string[] }
  | { kind: "market"; ids: string[] }
  | { kind: "place"; ids: string[] }
  | { kind: "tag"; ids: string[] }
  | null;

export type EventsScreenProps = {
  filters: EventsListFilters;
  /** The list's query string, carried to the editor so Save and Esc come back to it. */
  query: string;
  result: EventsListResult;
  empty: { text: string; clearHref: string | null; clearLabel: string };
  /** Set when more events match than the list read; `href` reads more, null at the most it reads. */
  more: { href: string | null } | null;
  summary: string;
  markets: PickOption[];
  places: PickOption[];
  tags: PickOption[];
};

const NOT_THROUGH = "That did not go through. Check the list, then try again.";

const CURSOR_ROW = "[data-roving-item][tabindex='0']";
const ANY_ROW = "[data-roving-item]";

/** "Emerge Holiday Market" for one event, "3 events" for more. */
function subjectOf(events: DialogEvent[]): string {
  return events.length === 1 ? events[0].title : `${events.length} events`;
}

function dialogEvent(id: string, rows: ReadonlyMap<string, EventListRow>): DialogEvent {
  const row = rows.get(id);
  if (!row) return { id, title: "Another date of the series", detail: "", tells: null };
  return { id, title: row.title, detail: `${row.startLabel}, ${row.placeLine}`, tells: row.tells };
}

/** The Events list: header, filters, weekend groups or the table, and the bulk bar. */
export function EventsScreen({ filters, query, result, empty, more, summary, markets, places, tags }: EventsScreenProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const { rail, markLive } = useRail();
  const [navigating, startNavigation] = React.useTransition();
  const [busy, startAction] = React.useTransition();
  const [ticked, setTickedState] = React.useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = React.useState(false);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [lastDecision, setLastDecision] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<BulkVerb | null>(null);

  const rows = React.useMemo(() => new Map(result.rows.map((r) => [r.id, r])), [result.rows]);

  const headRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const refocusPending = React.useRef(false);
  const [refocusRequest, setRefocusRequest] = React.useState(0);

  /**
   * Clearing the ticks, a bulk action or an undo can remove the control that had focus (the bulk
   * bar, a dialog's trigger, a toast, or a row that left the list); focus then goes back to the
   * list's cursor row. The request stays open until the action's transition ends, because the
   * refreshed rows land after it.
   */
  const requestRefocus = React.useCallback(() => {
    refocusPending.current = true;
    setRefocusRequest((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (!refocusPending.current) return;
    if (!busy) refocusPending.current = false;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      const root = bodyRef.current;
      const row = root?.querySelector<HTMLElement>(CURSOR_ROW) ?? root?.querySelector<HTMLElement>(ANY_ROW);
      row?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [refocusRequest, result.rows, busy]);

  const [seenQuery, setSeenQuery] = React.useState(query);
  if (seenQuery !== query) {
    setSeenQuery(query);
    if (ticked.size > 0) setTickedState(new Set());
  }

  const announcedQuery = React.useRef(query);
  React.useEffect(() => {
    if (announcedQuery.current === query) return;
    announcedQuery.current = query;
    announce(summary);
  }, [query, summary, announce]);

  const navigate = React.useCallback(
    (href: string) => startNavigation(() => router.replace(href, { scroll: false })),
    [router]
  );

  const hrefFor = React.useCallback(
    (id: string) => `/admin/events/${id}?from=events${query ? `&${query}` : ""}`,
    [query]
  );

  const setTicked = React.useCallback((ids: readonly string[], on: boolean) => {
    setTickedState((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const titleOf = React.useCallback((id: string) => rows.get(id)?.title, [rows]);

  const undo = React.useCallback(
    (decisionId: string) => {
      startAction(async () => {
        const outcome = await undoEventsAction({ decisionId }).catch(() => ({ ok: false, message: NOT_THROUGH }));
        setLastDecision((current) => (current === decisionId ? null : current));
        toast(outcome.message);
        announce(outcome.message);
        requestRefocus();
      });
    },
    [announce, requestRefocus]
  );

  const run = React.useCallback(
    (verb: BulkVerb, ids: string[], action: () => Promise<BulkOutcome>, target?: string) => {
      setRunning(verb);
      startAction(async () => {
        const outcome = await action()
          .catch((): BulkOutcome => ({ ok: false, message: NOT_THROUGH }))
          .finally(() => setRunning(null));
        setDialog(null);
        if (!outcome.ok) {
          toast(outcome.message);
          announce(outcome.message);
          return;
        }
        const message = bulkMessage(verb, outcome, { titleOf, target });
        const railLine = verb === "publish" ? railAfterPublish(rail.weeks, outcome.changed) : "";
        if (verb === "publish") markLive(outcome.changed);
        announce(railLine ? `${message} ${railLine}` : message);
        if (outcome.decisionId) {
          const decisionId = outcome.decisionId;
          setLastDecision(decisionId);
          toastWithUndo(message, () => undo(decisionId));
        } else {
          toast(message);
        }
        setTicked(ids, false);
        requestRefocus();
      });
    },
    [announce, markLive, rail.weeks, requestRefocus, setTicked, titleOf, undo]
  );

  const tells = React.useCallback((ids: string[]) => ids.some((id) => !!rows.get(id)?.tells), [rows]);

  const publish = React.useCallback(
    (ids: string[]) => {
      const open = ids.filter((id) => !rows.get(id)?.archived);
      if (open.length === 0) return;
      if (shouldListTitles(open.map((id) => dialogEvent(id, rows)), tells(open))) setDialog({ kind: "publish", ids: open });
      else run("publish", open, () => publishEventsAction({ ids: open }));
    },
    [rows, run, tells]
  );

  const archive = React.useCallback(
    (ids: string[]) => {
      const open = ids.filter((id) => !rows.get(id)?.archived);
      if (open.length === 0) return;
      if (open.length > 10) setDialog({ kind: "archive", ids: open });
      else run("archive", open, () => archiveEventsAction({ ids: open }));
    },
    [rows, run]
  );

  const api = React.useMemo<EventsListApi>(
    () => ({
      rows,
      ticked,
      selecting,
      setTicked,
      hrefFor,
      publish,
      reject: (ids) => {
        const open = ids.filter((id) => !rows.get(id)?.archived);
        if (open.length > 0) setDialog({ kind: "reject", ids: open });
      },
      archive,
      restore: (ids) => run("restore", ids, () => restoreEventsAction({ ids })),
      seriesIds: result.seriesIds,
      expanded,
      toggleExpanded: (key) =>
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),
      busy,
    }),
    [rows, ticked, selecting, setTicked, hrefFor, publish, archive, run, result.seriesIds, expanded, busy]
  );

  const tickedIds = [...ticked];
  const publishable = tickedIds.filter((id) => rows.get(id)?.mark !== "PUBLISHED");
  const clearTicks = React.useCallback(() => {
    if (ticked.size === 0) return false;
    setTickedState(new Set());
    announce("Nothing ticked.");
    requestRefocus();
    return true;
  }, [ticked.size, announce, requestRefocus]);

  const { ref: listRef, onKeyDown: onListKeyDown, onFocus: onListFocus } = useListKeys({
    onTick: (ids) => {
      if (ids.length === 0) return;
      const all = ids.every((id) => ticked.has(id));
      setTicked(ids, !all);
    },
    onExtend: (fromIds, toIds) => setTicked([...fromIds, ...toIds], true),
    onClear: clearTicks,
  });

  const clearTicksRef = React.useRef(clearTicks);
  React.useEffect(() => {
    clearTicksRef.current = clearTicks;
  });

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const target = event.target as Element | null;
      if (isTypingTarget(target) || target?.closest?.("dialog[open]")) return;
      const screen = headRef.current?.closest(".sm-screen");
      if (!screen || !(target === document.body || (target && screen.contains(target)))) return;
      if (clearTicksRef.current()) event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useShortcuts({
    p: () => {
      if (publishable.length > 0 && !busy) publish(publishable);
    },
    x: () => {
      if (tickedIds.length > 0 && !busy) api.reject(tickedIds);
    },
    u: () => {
      if (lastDecision && !busy) undo(lastDecision);
    },
  });

  const dialogEvents = dialog ? dialog.ids.map((id) => dialogEvent(id, rows)) : [];
  const dialogTells = dialogEvents.map((e) => e.tells).filter((t): t is string => !!t);
  const optionLabel = (options: PickOption[], value: string) => options.find((o) => o.value === value)?.label;

  const tableMode = filters.view === "table";
  const hasRows = result.rows.length > 0;

  return (
    <EventsListProvider value={api}>
      <Screen className="grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <div ref={headRef} className="space-y-4 border-b border-seam bg-fog px-4 pt-4 pb-3 md:px-6 md:pt-5">
          <PageHeader
            title="Events"
            actions={
              <>
                {!tableMode && hasRows && (
                  <AdminButton
                    variant="quiet"
                    size="sm"
                    className="md:hidden"
                    aria-pressed={selecting}
                    onClick={() => {
                      if (selecting) setTickedState(new Set());
                      setSelecting(!selecting);
                    }}
                  >
                    {selecting ? "Done" : "Select"}
                  </AdminButton>
                )}
                <ViewControl filters={filters} className="hidden md:inline-flex" />
                <AdminLinkButton
                  href="/admin/events/new"
                  variant={ticked.size > 0 ? "outline" : "ink"}
                  aria-keyshortcuts="n"
                >
                  New event
                </AdminLinkButton>
              </>
            }
          />
          <EventsFilters
            filters={filters}
            sourceOptions={result.sourceOptions}
            weekLabel={result.weekLabel}
            navigate={navigate}
          />
        </div>

        <Pane label="Events" className="p-0" tone="sheet">
          <div ref={bodyRef} aria-busy={navigating || undefined} className={cn(navigating && "opacity-60")}>
            {!hasRows ? (
              <Empty
                className="px-4 md:px-6"
                action={empty.clearHref ? { label: empty.clearLabel, href: empty.clearHref } : undefined}
              >
                {empty.text}
              </Empty>
            ) : tableMode ? (
              <EventsTable rows={result.rows} filters={filters} today={result.today} hrefFor={hrefFor} />
            ) : (
              <div ref={listRef} onKeyDown={onListKeyDown} onFocus={onListFocus}>
                {result.groups.map((group) => (
                  <WeekendGroup key={group.key} group={group} />
                ))}
              </div>
            )}
            {more && (
              <p className="border-t border-seam px-4 py-4 font-text text-sm text-ash md:px-6">
                More events match than this list shows.{" "}
                {more.href ? (
                  <Link href={more.href} className="rounded-sm text-lilac underline-offset-4 hover:underline">
                    Show more
                  </Link>
                ) : (
                  "Narrow the search or filters to see the rest."
                )}
              </p>
            )}
          </div>
        </Pane>

        <BulkBar count={ticked.size} onClear={() => clearTicks()}>
          {publishable.length > 0 && (
            <AdminButton
              variant="publish"
              size="sm"
              aria-keyshortcuts="p"
              busy={running === "publish" && dialog === null}
              busyLabel="Publishing"
              onClick={() => publish(publishable)}
            >
              Publish {publishable.length}
            </AdminButton>
          )}
          <AdminButton
            variant="danger-outline"
            size="sm"
            aria-keyshortcuts="x"
            className="hidden md:inline-flex"
            onClick={() => api.reject(tickedIds)}
          >
            Reject…
          </AdminButton>
          <AdminButton variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setDialog({ kind: "market", ids: tickedIds })}>
            Link to market…
          </AdminButton>
          <AdminButton variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setDialog({ kind: "place", ids: tickedIds })}>
            Set place…
          </AdminButton>
          <AdminButton variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => setDialog({ kind: "tag", ids: tickedIds })}>
            Add tag…
          </AdminButton>
          <AdminButton variant="outline" size="sm" className="hidden md:inline-flex" onClick={() => archive(tickedIds)}>
            <Archive strokeWidth={1.75} aria-hidden="true" />
            Archive
          </AdminButton>
          <span className="md:hidden">
            <Menu
              label="More bulk actions"
              variant="outline"
              size="sm"
              placement="top-start"
              trigger="More"
              items={[
                { label: "Reject…", onSelect: () => api.reject(tickedIds) },
                { label: "Link to market…", onSelect: () => setDialog({ kind: "market", ids: tickedIds }) },
                { label: "Set place…", onSelect: () => setDialog({ kind: "place", ids: tickedIds }) },
                { label: "Add tag…", onSelect: () => setDialog({ kind: "tag", ids: tickedIds }) },
                { label: "Archive", description: "Out of every list. Can be restored.", onSelect: () => archive(tickedIds) },
              ]}
            />
          </span>
        </BulkBar>
      </Screen>

      <ConfirmBulkDialog
        open={dialog?.kind === "publish"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Publish ${subjectOf(dialogEvents)}?`}
        events={dialogEvents}
        confirmLabel={tellLabel(`Publish ${dialogEvents.length}`, dialogTells)}
        variant="publish"
        busy={busy}
        busyLabel="Publishing"
        notifies
        onConfirm={() => {
          const ids = dialog?.ids ?? [];
          run("publish", ids, () => publishEventsAction({ ids }));
        }}
      />
      <ConfirmBulkDialog
        open={dialog?.kind === "archive"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Archive ${subjectOf(dialogEvents)}?`}
        events={dialogEvents}
        confirmLabel={`Archive ${dialogEvents.length}`}
        variant="ink"
        busy={busy}
        busyLabel="Archiving"
        notifies={false}
        onConfirm={() => {
          const ids = dialog?.ids ?? [];
          run("archive", ids, () => archiveEventsAction({ ids }));
        }}
      />
      <RejectDialog
        open={dialog?.kind === "reject"}
        onOpenChange={(open) => !open && setDialog(null)}
        events={dialogEvents}
        busy={busy}
        onConfirm={(reason) => {
          const ids = dialog?.ids ?? [];
          run("reject", ids, () => rejectEventsAction({ ids, reason }));
        }}
      />
      <PickDialog
        open={dialog?.kind === "market"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Link ${subjectOf(dialogEvents)} to a market`}
        searchLabel="Find a market"
        options={markets}
        none={{ value: "", label: "No market", detail: "Take them out of their market" }}
        events={dialogEvents}
        busy={busy}
        busyLabel="Linking"
        confirmLabel={(choice) =>
          !choice ? "Link" : choice.value === "" ? `Unlink ${dialogEvents.length}` : `Link ${dialogEvents.length}`
        }
        onConfirm={(choice) => {
          const ids = dialog?.ids ?? [];
          const marketId = choice.value || null;
          run(marketId ? "link" : "unlink", ids, () => linkEventsToMarketAction({ ids, marketId }), optionLabel(markets, choice.value));
        }}
      />
      <PickDialog
        open={dialog?.kind === "place"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Move ${subjectOf(dialogEvents)} to another place`}
        searchLabel="Find a place"
        options={places}
        events={dialogEvents}
        busy={busy}
        busyLabel="Moving"
        confirmLabel={(choice) => (choice ? `Move ${dialogEvents.length} here` : "Move")}
        onConfirm={(choice) => {
          const ids = dialog?.ids ?? [];
          run("place", ids, () => setEventsPlaceAction({ ids, venueId: choice.value }), choice.label);
        }}
      />
      <PickDialog
        open={dialog?.kind === "tag"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Add a tag to ${subjectOf(dialogEvents)}`}
        searchLabel="Find a tag"
        options={tags}
        events={dialogEvents}
        busy={busy}
        busyLabel="Tagging"
        confirmLabel={(choice) => (choice ? `Add to ${dialogEvents.length}` : "Add")}
        onConfirm={(choice) => {
          const ids = dialog?.ids ?? [];
          run("tag", ids, () => addTagToEventsAction({ ids, tagId: choice.value }), choice.label);
        }}
      />
    </EventsListProvider>
  );
}

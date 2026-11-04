"use client";

import * as React from "react";
import Link from "next/link";
import { Empty } from "@/components/admin/kit/empty";
import { AdminButton, adminButtonClass } from "@/components/admin/kit/button";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import type { Decision } from "@/lib/admin/decisions";
import type { PlaceDecisionData } from "@/lib/venues/place-decision-data";
import { getPlaceDecisionData } from "@/app/admin/_actions/venues";
import { ArchivedInUseItemView } from "@/components/admin/venues/archived-in-use";
import { DecisionRowProvider, type DecisionRow } from "@/components/admin/venues/decision-row";
import { DuplicateGroup } from "@/components/admin/venues/duplicate-group";
import { NeighborhoodBucketsView } from "@/components/admin/venues/neighborhood-buckets";
import { SpellingTable } from "@/components/admin/venues/spelling-table";
import { UnusedPlaces } from "@/components/admin/venues/unused-places";
import { VenueActionEvents, type VenueActionDone, type VenueActionListener } from "@/components/admin/venues/use-venue-action";
import { DecisionHeader, useStandardActions } from "../decision-parts";
import { useTodo } from "../todo-context";

const VIEW_OF: Record<string, string> = {
  "place-duplicates": "duplicates",
  "zip-neighborhood": "no-neighborhood",
  spelling: "spelling",
  "archived-in-use": "archived-in-use",
  "unused-places": "unused",
};

/** What an action in the pane did. The pane has already shown it in a toast (with Undo) and announced it. */
export type PlaceOutcome = { decisionId?: string; undoable: boolean; message: string };

function outcomeOf(result: VenueActionDone): PlaceOutcome {
  return { decisionId: result.decisionId, undoable: result.undoable, message: result.message };
}

type Loaded = { key: string; data: PlaceDecisionData | null; version: number };

/**
 * The pane of a place decision on To do (duplicates, a ZIP without a neighborhood, spelling, an
 * archived place in use, places nothing uses). It renders the same component as the matching
 * Venues view, read fresh for this decision, and reads it again after every action and undo, so a
 * half-done decision shows only what is left. P, with focus in the pane, presses the button marked
 * data-decision-primary (the view's suggested action), which carries the P hint; a frame can do the
 * same from the pile. Later (L) sits at the end of the view's action row; `u` and the move to the
 * next decision belong to the decision frame around it.
 */
export function PlaceDecision({
  decision,
  position,
  onSettled,
  onAction,
}: {
  decision: Decision;
  /** "2 of 10, places" */
  position?: string;
  /** Nothing is left to decide: with the action that finished it, or null when it was settled when it loaded. */
  onSettled?: (outcome: PlaceOutcome | null) => void;
  /** After every action in the pane that succeeded, settled or not, so the frame can offer `u` for its decisionId. */
  onAction?: (outcome: PlaceOutcome) => void;
}) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const data = loaded?.key === decision.key ? loaded.data : undefined;
  const [now] = React.useState(() => new Date().toISOString());
  const settledRef = React.useRef(onSettled);
  const actionRef = React.useRef(onAction);
  const keyRef = React.useRef(decision.key);
  const ref = React.useRef<HTMLElement>(null);
  const { singleKeys } = useTodo();
  const { later } = useStandardActions(decision);

  useShortcuts(
    {
      p: () => ref.current?.querySelector<HTMLButtonElement>("[data-decision-primary]:not(:disabled)")?.click(),
    },
    { scope: ref }
  );

  React.useEffect(() => {
    settledRef.current = onSettled;
    actionRef.current = onAction;
    keyRef.current = decision.key;
  });

  const load = React.useCallback(async (key: string, settled: { outcome: PlaceOutcome | null } | null) => {
    const result = await getPlaceDecisionData(key);
    if (keyRef.current !== key) return;
    setLoaded((prev) => ({ key, data: result, version: (prev?.version ?? 0) + 1 }));
    if (result === null && settled) settledRef.current?.(settled.outcome);
  }, []);

  React.useEffect(() => {
    let live = true;
    const key = decision.key;
    void getPlaceDecisionData(key).then((result) => {
      if (!live) return;
      setLoaded((prev) => ({ key, data: result, version: (prev?.version ?? 0) + 1 }));
      if (result === null) settledRef.current?.(null);
    });
    return () => {
      live = false;
    };
  }, [decision.key]);

  const version = loaded?.version ?? 0;
  React.useEffect(() => {
    if (version > 1 && document.activeElement === document.body) document.getElementById("todo-decision-title")?.focus();
  }, [version]);

  const listener = React.useMemo<VenueActionListener>(
    () => ({
      onDone: (result) => {
        const outcome = outcomeOf(result);
        actionRef.current?.(outcome);
        void load(keyRef.current, { outcome });
      },
      onUndone: () => void load(keyRef.current, null),
    }),
    [load]
  );

  const view = VIEW_OF[decision.kind] ?? "all";
  const remount = `${decision.key}:${version}`;
  const row: DecisionRow = {
    primaryKeys: singleKeys ? "P" : undefined,
    extra: later && (
      <AdminButton variant="outline" keys={singleKeys ? later.keys : undefined} onClick={later.onClick} disabled={later.disabled}>
        {later.label}
      </AdminButton>
    ),
  };

  return (
    <section ref={ref} aria-labelledby="todo-decision-title" className="space-y-4 [&_kbd]:hidden lg:[&_kbd]:inline-flex">
      <DecisionHeader
        title={decision.title}
        meta={position}
        context={decision.detail}
        className="mb-0"
      />
      {data === undefined && <p className="text-sm text-ash">Loading this decision.</p>}
      {data === null && (
        <Empty
          action={
            <Link href={`/admin/venues?view=${view}`} className={adminButtonClass({ variant: "outline", size: "sm" })}>
              Open Venues
            </Link>
          }
        >
          This one is settled.
        </Empty>
      )}
      <VenueActionEvents listener={listener}>
        <DecisionRowProvider value={row}>
          {data?.kind === "place-duplicates" && (
            <DuplicateGroup key={remount} plan={data.plan} neighborhoods={data.neighborhoods} headingLevel="h3" now={now} showLater={false} />
          )}
          {data?.kind === "zip-neighborhood" && (
            <NeighborhoodBucketsView key={remount} buckets={data.buckets} neighborhoods={data.neighborhoods} now={now} decisionKey={data.key} showFilter={false} />
          )}
          {data?.kind === "spelling" && <SpellingTable key={remount} rows={data.rows} mismatches={data.mismatches} decisionKey={data.key} />}
          {data?.kind === "archived-in-use" && <ArchivedInUseItemView key={remount} item={data.item} now={now} decisionKey={data.key} headingLevel="h3" />}
          {data?.kind === "unused-places" && <UnusedPlaces key={remount} rows={data.rows} decisionKey={data.key} />}
        </DecisionRowProvider>
      </VenueActionEvents>
    </section>
  );
}

export default PlaceDecision;

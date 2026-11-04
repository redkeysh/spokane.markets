import * as React from "react";
import type { ComponentType } from "react";
import type { Decision, DecisionKind } from "@/lib/admin/decisions/types";
import { BatchDecision } from "./kinds/batch-decision";
import { FallbackDecision } from "./kinds/fallback-decision";
import { LeftoverDecision } from "./kinds/leftover-decision";
import { LooksWrongDecision } from "./kinds/looks-wrong-decision";
import { PlaceDecision } from "./kinds/place-decision";
import { SingleDecision } from "./kinds/single-decision";
import { SubmissionDecision } from "./kinds/submission-decision";
import { TwinDecision } from "./kinds/twin-decision";
import { useDecisionKeys, useTodo } from "./todo-context";

/**
 * What every decision pane receives. Panes read events, submissions and the actions through
 * useTodo(), and build their header and action row from decision-pane.tsx.
 */
export type DecisionPaneProps = {
  decision: Decision;
  /** "2 of 10, this weekend" */
  position: string;
};

/**
 * A place decision's pane. It shows its own toasts and announcements; the frame keeps each
 * action's decision for `u`, moves on once nothing is left to decide, and lets P from the pile
 * press the pane's suggested action (the pane handles P itself when focus is inside it).
 */
function PlacePane({ decision, position }: DecisionPaneProps) {
  const { rememberUndo, settle } = useTodo();
  const ref = React.useRef<HTMLDivElement>(null);
  useDecisionKeys({
    p: () => ref.current?.querySelector<HTMLButtonElement>("[data-decision-primary]:not(:disabled)")?.click(),
  });
  return (
    <div ref={ref}>
      <PlaceDecision
        decision={decision}
        position={position}
        onAction={(outcome) => {
          if (outcome.decisionId && outcome.undoable) rememberUndo(outcome.decisionId);
        }}
        onSettled={(outcome) => {
          if (outcome) settle(decision);
        }}
      />
    </div>
  );
}

/** The pane for each decision kind. A kind with no entry here uses FallbackDecision (Open and Later). */
export const DECISION_PANES: Partial<Record<DecisionKind, ComponentType<DecisionPaneProps>>> = {
  ready: BatchDecision,
  "trade-shows": BatchDecision,
  single: SingleDecision,
  "looks-wrong": LooksWrongDecision,
  gone: LeftoverDecision,
  "approved-unpublished": LeftoverDecision,
  submission: SubmissionDecision,
  twins: TwinDecision,
  "maybe-twins": TwinDecision,
  "place-duplicates": PlacePane,
  "zip-neighborhood": PlacePane,
  spelling: PlacePane,
  "archived-in-use": PlacePane,
  "unused-places": PlacePane,
};

export function paneFor(kind: DecisionKind): ComponentType<DecisionPaneProps> {
  return DECISION_PANES[kind] ?? FallbackDecision;
}

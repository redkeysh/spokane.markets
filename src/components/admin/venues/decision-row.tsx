"use client";

import * as React from "react";

/**
 * What To do adds to a place view rendered as a decision: the key hint of the view's suggested
 * action (data-decision-primary) and the frame's own buttons, such as Later, at the end of the
 * view's action row. Empty on the Venues screens.
 */
export type DecisionRow = { primaryKeys?: string; extra?: React.ReactNode };

const DecisionRowContext = React.createContext<DecisionRow>({});

export function DecisionRowProvider({ value, children }: { value: DecisionRow; children: React.ReactNode }) {
  return <DecisionRowContext.Provider value={value}>{children}</DecisionRowContext.Provider>;
}

export function useDecisionRow(): DecisionRow {
  return React.useContext(DecisionRowContext);
}

"use client";

import * as React from "react";
import { useShortcuts, type ShortcutMap } from "@/components/admin/kit/use-shortcuts";
import type { EventEditsInput } from "./held-edits";
import type { RejectReasonKey } from "./decision-model";
import type { Decision, TodoActionResult, TodoData, TodoEvent, TodoLane, TodoSubmission } from "./types";

/** What the reject dialog asks and does. `run` receives the chosen reason text. */
export type RejectRequest = {
  decision: Decision;
  /** "Keep Emerge Holiday Market off the site?" */
  title: string;
  /** Titles listed in the dialog when the action notifies people or covers more than 10 rows. */
  titles: string[];
  count: number;
  notifies: string[];
  defaultReason?: RejectReasonKey;
  run: (reason: string) => Promise<boolean>;
};

export type KeepOneOptions = { keepId: string; archiveIds: string[]; publish: boolean; takeFromOthers: boolean };

/** A pane's unsaved edits, so moving away can ask first. */
export type DirtyEntry = { count: number; save: () => Promise<boolean> };

export type TodoApi = {
  data: TodoData;
  now: Date;
  lanes: TodoLane[];
  events: Record<string, TodoEvent>;
  submissions: Record<string, TodoSubmission>;
  /** Visible decisions, every lane, in pile order. */
  decisions: Decision[];
  /** The decision key an action is running for. */
  busy: string | null;
  /** Whether this pane's shortcuts may fire (it is on screen). */
  keysEnabled: boolean;
  singleKeys: boolean;
  /** True for single decisions made by splitting a batch: they have no Later of their own. */
  isSplit: (key: string) => boolean;

  confirmPublish: (decision: Decision, eventIds: string[]) => void;
  publish: (decision: Decision, eventIds: string[], edits?: Record<string, EventEditsInput>) => Promise<boolean>;
  rejectEvents: (decision: Decision, eventIds: string[], reason: string, edits?: Record<string, EventEditsInput>) => Promise<boolean>;
  openReject: (request: RejectRequest) => void;
  archive: (decision: Decision, eventIds: string[]) => Promise<boolean>;
  keepOne: (decision: Decision, options: KeepOneOptions) => Promise<boolean>;
  different: (decision: Decision) => Promise<boolean>;
  later: (decision: Decision, until: "tomorrow" | "next-monday") => Promise<boolean>;
  publishSubmission: (decision: Decision, submissionId: string, draft?: Record<string, string>) => Promise<boolean>;
  rejectSubmission: (decision: Decision, submissionId: string, reason: string) => Promise<boolean>;
  saveSubmissionPlace: (decision: Decision, submissionId: string, draft: Record<string, string>) => Promise<boolean>;
  /** Saves held edits; with `decide` the save settles the decision and the cursor moves on. */
  saveEdits: (decision: Decision, eventId: string, edits: EventEditsInput, options?: { decide?: boolean }) => Promise<boolean>;
  split: (decision: Decision) => void;
  goTo: (decisionKey: string) => void;
  openLane: (lane: Decision["lane"]) => void;
  openEditor: (decision: Decision, rowId?: string) => void;
  /** For panes whose own actions show their toast (places): `u` undoes this decision next. */
  rememberUndo: (decisionId: string) => void;
  /** For panes whose own actions settle the decision: takes it off the pile and moves the cursor on. */
  settle: (decision: Decision) => void;

  setDirty: (entry: DirtyEntry | null) => void;
  /** Set while moving away waits on "Save changes first?". */
  pendingLeave: { save: () => void; discard: () => void; cancel: () => void } | null;
  /** Announces through the shell's live region. */
  announce: (message: string) => void;
};

export const TodoContext = React.createContext<TodoApi | null>(null);

export function useTodo(): TodoApi {
  const value = React.useContext(TodoContext);
  if (!value) throw new Error("useTodo must be used inside the To do screen");
  return value;
}

/** Shortcuts of the decision on screen; off while it is hidden (the phone list) or busy. */
export function useDecisionKeys(bindings: ShortcutMap) {
  const { keysEnabled, busy } = useTodo();
  useShortcuts(bindings, { enabled: keysEnabled && !busy });
}

/** Reports a pane's unsaved edits while it is mounted. */
export function useDirty(count: number, save: () => Promise<boolean>) {
  const { setDirty } = useTodo();
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });
  React.useEffect(() => {
    setDirty(count > 0 ? { count, save: () => saveRef.current() } : null);
  }, [count, setDirty]);
  React.useEffect(() => () => setDirty(null), [setDirty]);
}

export type { TodoActionResult };

"use client";

import * as React from "react";
import { toast } from "sonner";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { undoPlaceDecision, type VenueActionResult } from "@/app/admin/_actions/venues";

export type VenueActionDone = Extract<VenueActionResult, { ok: true }>;

/** The screen's last undoable decision: `remember` on success, `forget` once its Undo ran. */
type LastDecision = { remember: (decisionId: string) => void; forget: (decisionId: string) => void };

const LastDecisionContext = React.createContext<LastDecision | null>(null);

/** Told about every venue action that succeeds below it, and about every Undo it runs. */
export type VenueActionListener = { onDone?: (result: VenueActionDone) => void; onUndone?: () => void };

const ListenerContext = React.createContext<VenueActionListener | null>(null);

/**
 * Remembers the last undoable venue decision of the screen, so `u` or Ctrl+Z undoes it the way
 * the toast's Undo does. Mount once per screen; a screen whose frame owns `u` (To do) leaves it
 * out and learns the decision ids through VenueActionEvents instead.
 */
export function VenueDecisions({ children }: { children: React.ReactNode }) {
  const last = React.useRef<string | null>(null);
  const undo = useUndo();
  useShortcuts({
    u: () => {
      if (last.current) void undo(last.current).then(() => (last.current = null));
    },
    "mod+z": (event) => {
      if (!last.current) return;
      event.preventDefault();
      void undo(last.current).then(() => (last.current = null));
    },
  });
  const value = React.useMemo<LastDecision>(
    () => ({
      remember: (decisionId) => {
        last.current = decisionId;
      },
      forget: (decisionId) => {
        if (last.current === decisionId) last.current = null;
      },
    }),
    []
  );
  return <LastDecisionContext.Provider value={value}>{children}</LastDecisionContext.Provider>;
}

/** Reports the venue actions run below it (and their undos) to `listener`. */
export function VenueActionEvents({ listener, children }: { listener: VenueActionListener; children: React.ReactNode }) {
  return <ListenerContext.Provider value={listener}>{children}</ListenerContext.Provider>;
}

function useUndo() {
  const announce = useAnnounce();
  const listener = React.useContext(ListenerContext);
  return React.useCallback(
    async (decisionId: string) => {
      const result = await undoPlaceDecision(decisionId);
      if (result.ok) toast(result.message);
      else toast.error(result.message);
      announce(result.message);
      listener?.onUndone?.();
    },
    [announce, listener]
  );
}

/**
 * Runs a venue server action: busy state, a toast (with Undo when the decision can be undone) and
 * the same sentence in the live region. The action revalidates the admin, so its response
 * carries the screen's fresh data.
 */
export function useVenueAction() {
  const announce = useAnnounce();
  const shared = React.useContext(LastDecisionContext);
  const listener = React.useContext(ListenerContext);
  const undo = useUndo();
  const [busy, setBusy] = React.useState<string | null>(null);

  const run = React.useCallback(
    async (label: string, action: () => Promise<VenueActionResult>, options: { onDone?: (result: VenueActionDone) => void } = {}) => {
      setBusy(label);
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          announce(result.error);
          return false;
        }
        if (result.undoable && result.decisionId) {
          const decisionId = result.decisionId;
          shared?.remember(decisionId);
          toastWithUndo(result.message, () => {
            shared?.forget(decisionId);
            void undo(decisionId);
          });
        } else {
          toast(result.message);
        }
        announce(result.message);
        options.onDone?.(result);
        listener?.onDone?.(result);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong.";
        toast.error(message);
        announce(message);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [announce, listener, shared, undo]
  );

  return { run, busy };
}

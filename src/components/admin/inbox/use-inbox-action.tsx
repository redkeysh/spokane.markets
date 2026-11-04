"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { isTypingTarget, useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { undoPublicDecision } from "@/app/admin/_actions/inbox";
import type { InboxActionResult } from "@/lib/admin/inbox/types";

export type InboxDone = Extract<InboxActionResult, { ok: true }>;

/** The page's last undoable decision: `remember` on success, `forget` once its Undo ran. */
type LastDecision = { remember: (decisionId: string) => void; forget: (decisionId: string) => void };

const LastDecisionContext = React.createContext<LastDecision | null>(null);

/** Undoes an inbox decision: a toast and the same sentence in the live region, then fresh data. */
function useInboxUndo() {
  const router = useRouter();
  const announce = useAnnounce();
  return React.useCallback(
    async (decisionId: string) => {
      const result = await undoPublicDecision(decisionId);
      if (result.ok) toast(result.message);
      else toast.error(result.message);
      announce(result.message);
      router.refresh();
    },
    [announce, router]
  );
}

/**
 * Remembers the last undoable decision made anywhere on the page, so `u` or Ctrl+Z undoes it the
 * way the toast's Undo does. Mount once per page. Ctrl+Z is left to text fields, and does
 * nothing else while no decision waits to be undone. A screen whose frame owns those keys (To do)
 * leaves it out.
 */
export function InboxDecisions({ children }: { children: React.ReactNode }) {
  const last = React.useRef<string | null>(null);
  const undo = useInboxUndo();
  const take = React.useCallback(() => {
    const id = last.current;
    last.current = null;
    return id;
  }, []);

  useShortcuts({
    u: () => {
      const id = take();
      if (id) void undo(id);
    },
  });

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      if (!last.current || isTypingTarget(e.target) || (e.target as Element | null)?.closest?.("dialog[open]")) return;
      e.preventDefault();
      const id = take();
      if (id) void undo(id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [take, undo]);

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

/**
 * Runs an inbox server action: busy state, a toast (with Undo when the decision can be undone),
 * the same sentence in the live region and fresh data. Inside InboxDecisions the decision is
 * remembered for `u` and Ctrl+Z. With `then`, a successful action goes to that address instead of
 * refreshing.
 */
export function useInboxAction(options: { onDone?: (result: InboxDone) => void } = {}) {
  const router = useRouter();
  const announce = useAnnounce();
  const shared = React.useContext(LastDecisionContext);
  const [busy, setBusy] = React.useState<string | null>(null);
  const onDone = React.useRef(options.onDone);
  React.useEffect(() => {
    onDone.current = options.onDone;
  });
  const undo = useInboxUndo();

  const run = React.useCallback(
    async (label: string, action: () => Promise<InboxActionResult>, then?: string): Promise<InboxDone | null> => {
      setBusy(label);
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          announce(result.error);
          return null;
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
        onDone.current?.(result);
        if (then && result.changed.length > 0) router.push(then);
        else router.refresh();
        return result;
      } catch (error) {
        console.error("[inbox]", error);
        const message = "Something went wrong. Try again.";
        toast.error(message);
        announce(message);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [announce, router, shared, undo]
  );

  return { run, busy };
}

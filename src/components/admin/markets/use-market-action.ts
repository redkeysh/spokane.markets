"use client";

import * as React from "react";
import { toast } from "sonner";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useRail } from "@/components/admin/shell/rail-context";
import { undoMarketChange, type MarketActionResult } from "@/app/admin/_actions/markets";

/**
 * Runs a markets server action and reports it: a toast (with Undo when the change can be undone),
 * the same words in the live region and the rail fill for dates that went live. The action
 * revalidates the admin, so its response carries the screen's fresh data.
 * `busy` holds the key of the action still running.
 */
export function useMarketAction() {
  const announce = useAnnounce();
  const { markLive } = useRail();
  const [busy, setBusy] = React.useState<string | null>(null);

  const report = React.useCallback(
    (result: MarketActionResult) => {
      if (!result.ok) {
        toast(result.error);
        announce(result.error);
        return;
      }
      if (result.publishedIds?.length) markLive(result.publishedIds);
      announce(result.message);
      const decisionId = result.decisionId;
      if (decisionId) {
        toastWithUndo(result.message, async () => {
          const undone = await undoMarketChange(decisionId);
          const words = undone.ok ? undone.message : undone.error;
          toast(words);
          announce(words);
        });
      } else {
        toast(result.message);
      }
    },
    [announce, markLive]
  );

  const run = React.useCallback(
    async (key: string, action: () => Promise<MarketActionResult>): Promise<MarketActionResult> => {
      setBusy(key);
      try {
        const result = await action();
        report(result);
        return result;
      } catch {
        const failed: MarketActionResult = { ok: false, error: "That did not work. Nothing was changed. Try again." };
        report(failed);
        return failed;
      } finally {
        setBusy(null);
      }
    },
    [report]
  );

  return { run, busy };
}

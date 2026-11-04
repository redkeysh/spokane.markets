"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import type { DuplicateGroupPlan } from "@/lib/venues/place-review";
import { mergeSafeGroups } from "@/app/admin/_actions/venues";
import { listWords, plural } from "@/lib/venues/words";
import { useVenueAction } from "./use-venue-action";

/**
 * "Merge these 5": groups whose extra records hold nothing and share the kept record's street
 * address. The confirm lists each group, all ticked, so any one can stay apart.
 */
export function SafeMerge({
  plans,
  primary,
  onFocus,
}: {
  plans: DuplicateGroupPlan[];
  /** Filled while the owner is on it; outline otherwise, so the pane keeps one filled button. */
  primary: boolean;
  onFocus: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [ticked, setTicked] = React.useState<Set<string>>(() => new Set(plans.map((p) => p.key)));
  const { run, busy } = useVenueAction();
  const chosen = plans.filter((p) => ticked.has(p.key));

  if (plans.length === 0) return null;

  const openDialog = () => {
    setTicked(new Set(plans.map((p) => p.key)));
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-seam py-4">
      <p className="max-w-[72ch] text-[15px]/[23px] text-basalt">
        {plans.length === 1 ? "1 group is" : `${plans.length} groups are`} the same address where the extra record holds nothing.
      </p>
      <AdminButton variant={primary ? "ink" : "outline"} onFocus={onFocus} onClick={openDialog}>
        Merge {plans.length === 1 ? "this one" : `these ${plans.length}`}
      </AdminButton>
      <AdminDialog
        open={open}
        onOpenChange={setOpen}
        size="list"
        title={`Merge ${plural(chosen.length, "group")}?`}
        description="Each kept place stays as it is. The empty records are archived; nothing moves. You can undo it."
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </AdminButton>
            <AdminButton
              variant="ink"
              disabled={chosen.length === 0}
              busy={busy === "safe"}
              busyLabel="Merging"
              onClick={() =>
                void run("safe", () => mergeSafeGroups({ groups: chosen.map((p) => ({ ids: p.records.map((r) => r.id) })) }), {
                  onDone: () => setOpen(false),
                })
              }
            >
              Merge {chosen.length}
            </AdminButton>
          </>
        }
      >
        <ul className="divide-y divide-seam">
          {plans.map((plan) => {
            const extras = plan.records.slice(1).map((r) => r.name.trim());
            const id = `safe-${plan.key}`;
            return (
              <li key={plan.key} className="flex items-start gap-3 py-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={ticked.has(plan.key)}
                  onChange={(e) =>
                    setTicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(plan.key);
                      else next.delete(plan.key);
                      return next;
                    })
                  }
                  className="mt-1 size-4 shrink-0 cursor-pointer accent-basalt"
                />
                <label htmlFor={id} className="min-w-0 cursor-pointer text-sm">
                  <span className="block font-medium text-basalt">{plan.records[0].name.trim()}</span>
                  <span className="block text-xs text-ash">
                    Archives {listWords(extras)}, {plan.records[0].address.trim()}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </AdminDialog>
    </div>
  );
}

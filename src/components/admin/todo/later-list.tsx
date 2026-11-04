"use client";

import * as React from "react";
import { toast } from "sonner";
import { bringBackDecision } from "@/app/admin/_actions/todo";
import { useAnnounce } from "@/components/admin/shell/live-region";
import type { TodoSnoozed } from "./types";

/** Decisions set aside with Later, with when each comes back and "Bring back". */
export function LaterList({ items }: { items: TodoSnoozed[] }) {
  const announce = useAnnounce();
  const [pending, setPending] = React.useState<string | null>(null);

  const bringBack = async (item: TodoSnoozed) => {
    setPending(item.decision.key);
    try {
      const result = await bringBackDecision({ decisionKey: item.decision.key, title: item.decision.title });
      const message = result.ok ? `${item.decision.title} is back in the pile.` : result.error;
      toast(message);
      announce(message);
    } catch {
      toast("That did not work. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-labelledby="todo-later" className="border-t border-seam px-4 pt-4 pb-6">
      <h3 id="todo-later" className="font-text text-[15px]/5 font-semibold text-basalt">
        Later <span className="font-normal text-ash tabular-nums">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ash">Nothing set aside</p>
      ) : (
        <ul role="list" className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.decision.key} className="text-sm">
              <p className="text-basalt">{item.decision.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-ash">
                <span className="tabular-nums">{item.back}</span>
                <button
                  type="button"
                  disabled={pending !== null}
                  onClick={() => void bringBack(item)}
                  className="-ml-1 inline-flex h-6 items-center rounded-sm px-1 font-medium text-lilac hover:bg-hover disabled:opacity-50"
                >
                  {pending === item.decision.key ? "Bringing back" : "Bring back"}
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

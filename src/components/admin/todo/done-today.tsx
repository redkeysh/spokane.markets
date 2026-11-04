"use client";

import type { TodoDoneItem } from "./types";

/** The owner's decisions since local midnight, newest first, each with Undo while it still can be. */
export function DoneToday({
  items,
  onUndo,
  busy,
}: {
  items: TodoDoneItem[];
  onUndo: (decisionId: string) => void;
  busy: boolean;
}) {
  return (
    <section aria-labelledby="todo-done-today" className="border-t border-seam px-4 pt-4 pb-2">
      <h3 id="todo-done-today" className="font-text text-[15px]/5 font-semibold text-basalt">
        Done today
      </h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ash">Nothing yet</p>
      ) : (
        <ul role="list" className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.decisionId ?? `${item.at}-${item.sentence}`} className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2">
              <time dateTime={item.at} className="pt-0.5 text-xs text-ash tabular-nums">
                {item.time}
              </time>
              <div className="min-w-0 text-sm text-basalt">
                <p className={item.undone ? "text-ash" : undefined}>{item.sentence}</p>
                {item.undone ? (
                  <p className="text-xs text-ash">Undone</p>
                ) : item.canUndo && item.decisionId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUndo(item.decisionId!)}
                    className="-ml-1 inline-flex h-6 items-center rounded-sm px-1 text-xs font-medium text-lilac hover:bg-hover disabled:opacity-50"
                  >
                    Undo
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

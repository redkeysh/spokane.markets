"use client";

import type { GroupEntry } from "@/lib/admin/events-query";
import { EventRow, type BracketPosition } from "./event-row";

function positionOf(index: number, count: number): BracketPosition {
  if (index === 0) return "first";
  return index === count - 1 ? "last" : "middle";
}

/**
 * Events that look like the same one (same day and place) side by side, joined by a bracket on
 * the left of their titles. Their menus offer "Compare in To do".
 */
export function TwinBracket({
  entries,
  groupKey,
  maybe,
}: {
  entries: GroupEntry[];
  groupKey: string;
  maybe: boolean;
}) {
  return (
    <li>
      <ul role="list" aria-label={maybe ? "Maybe the same event" : "Same day and place"}>
        {entries.map((entry, i) => (
          <EventRow
            key={entry.id}
            entry={entry}
            groupKey={groupKey}
            bracket={{ position: positionOf(i, entries.length), maybe }}
          />
        ))}
      </ul>
    </li>
  );
}

"use client";

import Link from "next/link";
import { GroupHeading } from "@/components/admin/kit/list";
import type { Area } from "@/lib/admin/regions";
import { isWeekLane, laneFact, type PileItem, type PileSection } from "./pile-model";
import { PileRow } from "./pile-row";

function quietLine(section: PileSection): string {
  if (section.lane.lane === "public") return "From the public: nothing";
  return `${section.lane.label}: nothing waiting`;
}

function headingFact(section: PileSection): string | null {
  const lane = section.lane;
  return lane.waiting ? `${lane.waiting} waiting` : null;
}

/** "This weekend at a glance", "Next weekend at a glance", else "The weekend at a glance". */
function briefRowTitle(label: string): string {
  if (label.startsWith("This weekend")) return "This weekend at a glance";
  if (label.startsWith("Next weekend")) return "Next weekend at a glance";
  return "The weekend at a glance";
}

/** The brief row's second line. */
function briefDetail(section: PileSection): string {
  const lane = section.lane;
  const decisions = section.items.filter((i) => i.type === "decision").length;
  if (decisions === 0) return lane.live ? `Set, ${lane.live} live` : "Nothing waiting";
  return `${decisions} ${decisions === 1 ? "decision" : "decisions"}, ${lane.live} live`;
}

/**
 * One lane of the pile. Open: its heading, the brief (weekend lanes) and its decisions. Closed:
 * one row with the waiting count, or a quiet line when nothing waits there.
 */
export function Lane({
  section,
  cursor,
  area,
  onSelect,
  onClearArea,
}: {
  section: PileSection;
  cursor: string | null;
  area: Area | null;
  onSelect: (item: PileItem) => void;
  onClearArea: () => void;
}) {
  const lane = section.lane;
  const week = isWeekLane(lane.lane);

  if (!section.open) {
    const item = section.items[0];
    if (!item) {
      return (
        <p className="px-4 py-2.5 text-sm text-ash">
          {quietLine(section)}
          {lane.lane === "public" && (
            <>
              {". "}
              <Link href="/admin/inbox" className="rounded-sm text-lilac underline-offset-2 hover:underline">
                See everything sent
              </Link>
            </>
          )}
        </p>
      );
    }
    return (
      <ul role="list">
        <li>
          <PileRow
            item={item}
            cursor={cursor === item.id}
            title={lane.label}
            fact={laneFact(lane, lane.decisions)}
            onSelect={onSelect}
          />
        </li>
      </ul>
    );
  }

  return (
    <section aria-label={lane.label}>
      <GroupHeading as="h3" fact={headingFact(section)}>
        {lane.label}
      </GroupHeading>
      {week && area && (
        <p className="flex flex-wrap items-center gap-x-2 px-4 py-1.5 text-xs text-ash">
          <span>
            Showing {area} only{section.filteredOut ? `, ${section.filteredOut} more elsewhere` : ""}.
          </span>
          <button
            type="button"
            onClick={onClearArea}
            className="inline-flex h-6 items-center rounded-sm px-1 font-medium text-lilac hover:bg-hover"
          >
            Show every area
          </button>
        </p>
      )}
      <ul role="list">
        {section.items.map((item) => (
          <li key={item.id}>
            {item.type === "brief" ? (
              <PileRow
                item={item}
                cursor={cursor === item.id}
                title={briefRowTitle(lane.label)}
                detail={briefDetail(section)}
                onSelect={onSelect}
              />
            ) : item.type === "decision" ? (
              <PileRow
                item={item}
                cursor={cursor === item.id}
                title={item.decision.title}
                detail={item.decision.detail}
                date={item.decision.firstDate ?? item.decision.rows[0]?.firstDate ?? null}
                onSelect={onSelect}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {section.items.length === 0 && <p className="px-4 py-2.5 text-sm text-ash">Nothing waiting here.</p>}
    </section>
  );
}

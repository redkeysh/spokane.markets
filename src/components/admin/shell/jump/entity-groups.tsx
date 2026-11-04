"use client";

import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { StallGlyph } from "@/components/admin/kit/stall";
import { StatusMark } from "@/components/admin/kit/status-mark";
import type { JumpGroup, JumpHit, JumpWeekend } from "@/lib/admin/search";
import { CAPTION_TONE } from "../rail";
import { railCaption, summaryStatus } from "../rail-labels";
import { JUMP_ITEM } from "./item-class";
import { hitLabel, moreLabel, weekendLabel } from "./results";

const ROW = cn(JUMP_ITEM, "flex-row items-center gap-3");

function Lines({ title, meta }: { title: string; meta: string | null }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="font-medium break-words">{title}</span>
      {meta && <span className="text-xs text-ash tabular-nums break-words">{meta}</span>}
    </span>
  );
}

/**
 * The weekend a typed date falls in, with the rail's summary stall and caption.
 * `disabled` keeps an earlier query's weekend on screen without letting it be chosen.
 */
export function WeekendGroup({
  weekend,
  disabled,
  onOpen,
}: {
  weekend: JumpWeekend;
  disabled: boolean;
  onOpen: () => void;
}) {
  const caption = railCaption(weekend.week);
  return (
    <Command.Group heading="Weekend">
      <Command.Item
        value={`weekend:${weekend.saturday}`}
        aria-label={weekendLabel(weekend)}
        disabled={disabled}
        onSelect={onOpen}
        className={ROW}
      >
        <StallGlyph status={summaryStatus(weekend.week)} size="md" />
        <Lines title={weekend.title} meta={weekend.meta} />
        <span className={cn("shrink-0 text-xs tabular-nums", CAPTION_TONE[caption.tone])}>{caption.text}</span>
      </Command.Item>
    </Command.Group>
  );
}

function HitItem({
  group,
  hit,
  disabled,
  onOpen,
}: {
  group: JumpGroup;
  hit: JumpHit;
  disabled: boolean;
  onOpen: (href: string) => void;
}) {
  return (
    <Command.Item
      value={`${group.key}:${hit.id}`}
      aria-label={hitLabel(hit)}
      disabled={disabled}
      onSelect={() => onOpen(hit.href)}
      className={ROW}
    >
      <Lines title={hit.title} meta={hit.meta} />
      {hit.status ? (
        <StatusMark status={hit.status} size="sm" />
      ) : (
        hit.note && <span className="shrink-0 text-xs text-ash">{hit.note}</span>
      )}
    </Command.Item>
  );
}

/**
 * Events, markets, places, vendors and people, five each, then a link to the full list when more match.
 * `disabled` keeps an earlier query's results on screen without letting them be chosen.
 */
export function EntityGroups({
  groups,
  query,
  disabled,
  onOpen,
}: {
  groups: JumpGroup[];
  query: string;
  disabled: boolean;
  onOpen: (href: string) => void;
}) {
  return groups.map((group) => {
    const more = group.moreHref;
    return (
      <Command.Group key={group.key} heading={group.heading}>
        {group.hits.map((hit) => (
          <HitItem key={hit.id} group={group} hit={hit} disabled={disabled} onOpen={onOpen} />
        ))}
        {more && (
          <Command.Item
            value={`more:${group.key}`}
            disabled={disabled}
            onSelect={() => onOpen(more)}
            className={cn(JUMP_ITEM, "font-medium text-lilac")}
          >
            {moreLabel(group.key, query)}
          </Command.Item>
        )}
      </Command.Group>
    );
  });
}

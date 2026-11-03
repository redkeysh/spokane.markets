"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRovingFocus } from "./use-roving";

export type SegmentOption<V extends string> = {
  value: V;
  label: string;
  /** Shown after the label in ash, e.g. "Sure 31". */
  count?: number;
  /** URL filters render segments as links. */
  href?: string;
};

const TRACK = "inline-flex h-[30px] items-stretch gap-0.5 rounded-md border border-seam bg-fog p-0.5";
const SEGMENT =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 font-text text-sm transition-colors duration-[80ms]";
const ON = "border-seam-strong bg-sheet font-medium text-basalt forced-colors:border-[Highlight]";
const OFF = "border-transparent text-ash hover:text-basalt forced-colors:border-[Canvas]";

function Content({ option }: { option: SegmentOption<string> }) {
  return (
    <>
      {option.label}
      {option.count !== undefined && <span className="text-xs text-ash tabular-nums">{option.count}</span>}
    </>
  );
}

/**
 * The main scope of a list ("Waiting", "Live", "Everything"). With hrefs it is a group of links
 * marking the current one; otherwise a radio group moved with the arrow keys.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: SegmentOption<V>[];
  value: V;
  onChange?: (value: V) => void;
  className?: string;
}) {
  const selected = Math.max(
    options.findIndex((o) => o.value === value),
    0
  );
  const roving = useRovingFocus<HTMLButtonElement>({
    count: options.length,
    orientation: "horizontal",
    onMove: (_from, to) => onChange?.(options[to].value),
  });

  if (options.every((o) => o.href)) {
    return (
      <div role="group" aria-label={label} className={cn(TRACK, className)}>
        {options.map((option) => (
          <Link
            key={option.value}
            href={option.href!}
            aria-current={option.value === value ? "true" : undefined}
            className={cn(SEGMENT, option.value === value ? ON : OFF)}
          >
            <Content option={option} />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn(TRACK, className)} onKeyDown={roving.onKeyDown}>
      {options.map((option, i) => {
        const props = roving.getItemProps(i);
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            ref={props.ref}
            tabIndex={i === selected ? 0 : -1}
            onFocus={props.onFocus}
            onClick={() => onChange?.(option.value)}
            className={cn(SEGMENT, option.value === value ? ON : OFF)}
          >
            <Content option={option} />
          </button>
        );
      })}
    </div>
  );
}

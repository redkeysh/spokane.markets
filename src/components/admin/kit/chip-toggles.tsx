"use client";

import { cn } from "@/lib/utils";
import { ToggleChip } from "./toggle-chip";

/**
 * Wrapped rows of toggle chips for tags and features. With `name`, the chosen values are also
 * posted as hidden inputs.
 */
export function ChipToggles({
  label,
  options,
  value,
  onChange,
  name,
  className,
}: {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: readonly string[];
  onChange: (value: string[]) => void;
  name?: string;
  className?: string;
}) {
  const chosen = new Set(value);
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((option) => (
        <ToggleChip
          key={option.value}
          pressed={chosen.has(option.value)}
          onPressedChange={(pressed) => {
            const next = new Set(chosen);
            if (pressed) next.add(option.value);
            else next.delete(option.value);
            onChange(options.map((o) => o.value).filter((v) => next.has(v)));
          }}
        >
          {option.label}
        </ToggleChip>
      ))}
      {name && value.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </div>
  );
}

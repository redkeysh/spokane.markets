"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An on/off switch with its label on the right and an optional line of help below. The control
 * is a button with role="switch"; the whole row is its 24 px or larger target.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  help,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  help?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = React.useId();
  const helpId = `${id}-help`;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={help ? helpId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-[80ms] disabled:opacity-50",
          "before:absolute before:-inset-[3px] before:content-['']",
          checked ? "border-basalt bg-basalt" : "border-seam-strong bg-sheet"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-block size-3.5 rounded-full",
            checked ? "translate-x-[17px] bg-on-basalt" : "translate-x-[2px] bg-ash"
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-basalt">
          {label}
        </label>
        {help && (
          <p id={helpId} className="mt-0.5 text-xs text-ash">
            {help}
          </p>
        )}
      </div>
    </div>
  );
}

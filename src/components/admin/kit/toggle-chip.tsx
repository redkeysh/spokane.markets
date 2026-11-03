"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** A filter or choice that is on or off, e.g. "Needs: Picture". Pressed: lilac-tint ground and a check. */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
  dashed = false,
  disabled,
  className,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: React.ReactNode;
  /** A suggestion that is not set yet. */
  dashed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-sm border border-seam-strong px-2.5 font-text text-sm text-basalt transition-colors duration-[80ms] disabled:opacity-50",
        dashed && "border-dashed",
        pressed ? "bg-lilac-tint" : "bg-sheet hover:bg-hover",
        className
      )}
    >
      {pressed && <Check className="size-4 shrink-0 text-basalt" strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
}

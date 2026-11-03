"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ThreeState = boolean | null;

function toOption(value: ThreeState): "inherit" | "show" | "hide" {
  return value === null ? "inherit" : value ? "show" : "hide";
}

/**
 * "Use the market's setting", "Show" or "Hide" as one select. null means inherit. With `name` it
 * posts "inherit", "show" or "hide".
 */
export const ThreeStateSelect = React.forwardRef<
  HTMLSelectElement,
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "defaultValue" | "onChange" | "children"> & {
    value: ThreeState;
    onValueChange: (value: ThreeState) => void;
    inheritLabel?: string;
    showLabel?: string;
    hideLabel?: string;
  }
>(function ThreeStateSelect(
  {
    value,
    onValueChange,
    inheritLabel = "Use the market's setting",
    showLabel = "Show",
    hideLabel = "Hide",
    className,
    ...props
  },
  ref
) {
  return (
    <select
      ref={ref}
      value={toOption(value)}
      onChange={(e) => onValueChange(e.target.value === "inherit" ? null : e.target.value === "show")}
      className={cn(
        "h-9 w-full rounded-md border border-seam-strong bg-sheet px-2 font-text text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base",
        className
      )}
      {...props}
    >
      <option value="inherit">{inheritLabel}</option>
      <option value="show">{showLabel}</option>
      <option value="hide">{hideLabel}</option>
    </select>
  );
});

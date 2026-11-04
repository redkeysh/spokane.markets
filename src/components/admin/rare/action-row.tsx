"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A row of a kit List whose title opens a dialog instead of a page. The title button is the
 * row's roving focus target and is stretched over the row, so a click anywhere on it or Enter
 * opens it; anything passed in `action` sits above it.
 */
export function ActionRow({
  rowKey,
  title,
  onOpen,
  openLabel,
  meta,
  leaf,
  status,
  action,
  hint,
  muted = false,
  className,
}: {
  rowKey: string;
  title: React.ReactNode;
  onOpen: () => void;
  /** Accessible name when the title alone does not say what opening does, e.g. "Edit Women-owned". */
  openLabel?: string;
  meta?: React.ReactNode;
  leaf?: React.ReactNode;
  status?: React.ReactNode;
  action?: React.ReactNode;
  /** A word on the right that shows mouse users what opening does, e.g. "Edit". Not announced: the row says it. */
  hint?: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "sm-row flex min-h-14 items-center gap-3 border-b border-seam bg-sheet px-4 py-2 hover:bg-hover",
        className
      )}
    >
      {leaf}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          data-roving-item
          data-row-key={rowKey}
          aria-haspopup="dialog"
          aria-label={openLabel}
          onClick={onOpen}
          className={cn(
            "sm-row-link block max-w-full cursor-pointer text-left font-text text-sm font-medium break-words",
            muted ? "text-ash-quiet" : "text-basalt"
          )}
        >
          {title}
        </button>
        {meta && <div className="mt-0.5 text-xs text-ash">{meta}</div>}
      </div>
      {status && <div className="shrink-0">{status}</div>}
      {hint && (
        <span aria-hidden="true" className="shrink-0 font-text text-sm font-medium text-lilac">
          {hint}
        </span>
      )}
      {action && (
        <div data-row-action className="shrink-0">
          {action}
        </div>
      )}
    </li>
  );
}

/** A plain row with no open action, for records that have nothing to open. */
export function StaticRow({
  title,
  meta,
  status,
  action,
  muted = false,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  action?: React.ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <li className={cn("flex min-h-14 items-center gap-3 border-b border-seam bg-sheet px-4 py-2", className)}>
      <div className="min-w-0 flex-1">
        <p className={cn("font-text text-sm font-medium break-words", muted ? "text-ash-quiet" : "text-basalt")}>{title}</p>
        {meta && <div className="mt-0.5 text-xs text-ash">{meta}</div>}
      </div>
      {status && <div className="shrink-0">{status}</div>}
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
}

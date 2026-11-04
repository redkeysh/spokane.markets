"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import type { EditorPosition } from "./types";

/**
 * Back link named for where the owner came from, the position among the waiting events of the
 * same weekend with Previous and Next, the title, the status and "View on site" when live.
 */
export function RecordHeader({
  backLabel,
  onBack,
  backHref,
  position,
  onPrevious,
  onNext,
  title,
  status,
  statusNote,
  liveHref,
}: {
  backLabel: string;
  backHref: string;
  onBack: () => void;
  position: EditorPosition | null;
  onPrevious: () => void;
  onNext: () => void;
  title: string;
  status: MarkStatus | null;
  /** A plain line after the status, e.g. "Sent from the site". */
  statusNote?: string | null;
  liveHref?: string | null;
}) {
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <a
          href={backHref}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onBack();
          }}
          aria-keyshortcuts="Escape"
          className="inline-flex min-h-6 items-center gap-2 rounded-sm text-sm text-lilac underline-offset-4 hover:underline"
        >
          {backLabel}
          <KeyHint keys="Esc" className="hidden md:inline-flex" />
        </a>
        {position && position.total > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs text-ash tabular-nums">
              {position.index} of {position.total} this weekend
            </p>
            <div className="flex items-center gap-1">
              <AdminButton
                variant="quiet"
                size="sm"
                keys="Alt+Up"
                disabled={!position.previousId}
                onClick={onPrevious}
                className="px-2 [&_kbd]:hidden md:[&_kbd]:inline-flex"
              >
                <ChevronLeft strokeWidth={1.75} aria-hidden="true" />
                Previous
              </AdminButton>
              <AdminButton
                variant="quiet"
                size="sm"
                keys="Alt+Down"
                disabled={!position.nextId}
                onClick={onNext}
                className="px-2 [&_kbd]:hidden md:[&_kbd]:inline-flex"
              >
                Next
                <ChevronRight strokeWidth={1.75} aria-hidden="true" />
              </AdminButton>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="min-w-0 font-display text-xl/[26px] font-bold break-words text-basalt">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {status && <StatusMark status={status} chip />}
          {statusNote && <span className="text-xs text-ash">{statusNote}</span>}
          {liveHref && (
            <a
              href={liveHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline"
            >
              View on site
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

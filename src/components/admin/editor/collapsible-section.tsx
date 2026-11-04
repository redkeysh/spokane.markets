"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fired by the section links so a collapsed section opens when the owner jumps to it. */
export const OPEN_SECTION_EVENT = "sm-editor-open-section";

/**
 * An editor section that starts collapsed behind its heading, with a one-line summary of what it
 * holds ("Same as the market", "0 of 33 filled").
 */
export function CollapsibleSection({
  id,
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = `${id}-content`;
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail === id) setOpen(true);
    };
    window.addEventListener(OPEN_SECTION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen);
  }, [id]);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4">
      <h2 id={`${id}-heading`} className="font-text text-[15px]/[20px] font-semibold text-basalt">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
          className="-ml-1 inline-flex min-h-6 items-center gap-1 rounded-sm pr-1 text-left"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-ash", open && "rotate-90")}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {title}
        </button>
      </h2>
      <p className="mt-0.5 pl-5 text-xs text-ash tabular-nums">{summary}</p>
      <div id={contentId} hidden={!open} className="mt-3 space-y-4 pl-5">
        {children}
      </div>
    </section>
  );
}

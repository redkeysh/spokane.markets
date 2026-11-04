import * as React from "react";
import { cn } from "@/lib/utils";

/** Content width of the editor: 1184 px plus 24 px gutters. */
export const EDITOR_WIDTH = "mx-auto w-full max-w-[1232px] px-4 md:px-6";

/**
 * The editor layout shared by events and submissions. In pane mode it is two grid rows: one
 * scroller (header, section links, then the main and side columns side by side when the
 * editor is at least 940 px wide, which leaves room for a scrollbar at 1024) and the action
 * bar, which never scrolls away and never covers a field. Nothing inside is sticky. In page mode the document scrolls and the action bar sticks to
 * the bottom.
 */
export function EditorShell({
  label,
  header,
  banner,
  main,
  side,
  actionBar,
  onKeyDown,
}: {
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /** The scroller's accessible name, e.g. "Editing North Idaho's Cowboy Christmas". */
  label: string;
  header: React.ReactNode;
  /** Above the columns, full width (the read-only notice of an archived record). */
  banner?: React.ReactNode;
  main: React.ReactNode;
  side: React.ReactNode;
  actionBar: React.ReactNode;
}) {
  return (
    <div
      onKeyDown={onKeyDown}
      className="flex min-h-full flex-col [@media(min-width:1024px)_and_(min-height:600px)]:grid [@media(min-width:1024px)_and_(min-height:600px)]:h-full [@media(min-width:1024px)_and_(min-height:600px)]:grid-rows-[minmax(0,1fr)_auto]"
    >
      <section
        aria-label={label}
        tabIndex={0}
        className="relative min-h-0 flex-1 bg-sheet focus-visible:outline-offset-[-2px] [@media(min-width:1024px)_and_(min-height:600px)]:overflow-y-auto"
      >
        <div className={cn(EDITOR_WIDTH, "pt-4 pb-10 md:pt-5")}>
          {header}
          {banner}
          <div className="@container/editor mt-6">
            <div className="grid grid-cols-1 gap-y-10 @min-[940px]/editor:grid-cols-[minmax(0,1fr)_296px] @min-[940px]/editor:gap-x-6 @min-[1180px]/editor:grid-cols-[minmax(0,1fr)_360px] @min-[1180px]/editor:gap-x-10">
              <div className="min-w-0 space-y-8">{main}</div>
              <aside aria-label="About this record" className="min-w-0 space-y-8">
                {side}
              </aside>
            </div>
          </div>
        </div>
      </section>
      {actionBar}
    </div>
  );
}

/** A side column section: a 15 px heading and its content, no box. */
export function SideSection({
  title,
  children,
  id,
  action,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  action?: React.ReactNode;
}) {
  const headingId = React.useId();
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="font-text text-[15px]/[20px] font-semibold text-basalt">
          {title}
        </h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

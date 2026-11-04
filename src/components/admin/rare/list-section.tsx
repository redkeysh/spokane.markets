import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A titled part of a page: a 15 px heading with an optional sentence below and one action on its
 * right, then the content. No box around it; parts are separated by space.
 */
export function ListSection({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("min-w-0 scroll-mt-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-text text-[15px]/[20px] font-semibold text-basalt">
            {title}
          </h2>
          {description && <p className="mt-0.5 max-w-[72ch] font-text text-sm text-ash">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

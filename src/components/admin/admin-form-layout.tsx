import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Main and side columns that scroll together; nothing in them is sticky. */
export function AdminTwoColumnFormLayout({
  main,
  aside,
}: {
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(296px,1fr)] xl:gap-10">
      <div className="min-w-0 space-y-8">{main}</div>
      <aside className="min-w-0 space-y-8">{aside}</aside>
    </div>
  );
}

/**
 * The form's action row. In pane mode it is a static footer at the end of the form; in page
 * mode it sticks to the bottom of the viewport, above the phone bottom bar.
 */
export function AdminStickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sm-sticky-bottom -mx-4 mt-8 border-t border-seam bg-sheet px-4 py-3 md:-mx-6 md:px-6",
        className
      )}
    >
      {children}
    </div>
  );
}

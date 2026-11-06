import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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

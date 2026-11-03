import { cn } from "@/lib/utils";
import { AdminButton } from "./button";

/**
 * Shown while rows are ticked: a grid row at the bottom of the list pane in pane mode, sticky at
 * the bottom in page mode. The first action is the filled one (cedar when it publishes).
 */
export function BulkBar({
  count,
  children,
  onClear,
  className,
}: {
  count: number;
  children: React.ReactNode;
  onClear: () => void;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div role="region" aria-label="Bulk actions" className={cn("sm-sticky-bottom border-t-2 border-lilac", className)}>
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-seam bg-sheet px-4 py-2">
        <p className="mr-2 font-text text-sm font-medium text-basalt" aria-live="polite">
          <span className="tabular-nums">{count}</span> selected
        </p>
        {children}
        <AdminButton variant="quiet" size="sm" className="ml-auto" onClick={onClear}>
          Clear
        </AdminButton>
      </div>
    </div>
  );
}

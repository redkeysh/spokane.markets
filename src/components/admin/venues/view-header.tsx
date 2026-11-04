import { cn } from "@/lib/utils";

/**
 * The title line of a venue view: the view name (the page's h1, read as "Venues: Duplicates"), a
 * plain fact and the actions on the right, then one line of description.
 */
export function ViewHeader({
  title,
  fact,
  description,
  actions,
  className,
}: {
  title: string;
  fact?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="min-w-0 font-display text-2xl/[30px] font-bold text-basalt">
          <span className="sr-only">Venues: </span>
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {fact && <p className="font-text text-sm text-ash tabular-nums">{fact}</p>}
          {actions}
        </div>
      </div>
      {description && <p className="max-w-[72ch] font-text text-sm text-ash">{description}</p>}
    </header>
  );
}

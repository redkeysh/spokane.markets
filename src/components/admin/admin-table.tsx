import { cn } from "@/lib/utils";

/** Consistent bordered, horizontally-scrollable table container. */
export function AdminTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

/** Standard header row. Pass <th> cells as children. */
export function AdminTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
      <tr>{children}</tr>
    </thead>
  );
}

/** Standard body wrapper with row dividers. */
export function AdminTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

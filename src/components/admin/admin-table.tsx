import { cn } from "@/lib/utils";

/** Table container on sheet with seam row lines; scrolls sideways only when it must. */
export function AdminTable({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto border-y border-seam bg-sheet", className)}>
      <table className="w-full font-text text-[13px]/[18px] tabular-nums">{children}</table>
    </div>
  );
}

/** Header row: sentence-case labels in ash, no fill. Pass <th> cells as children. */
export function AdminTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-seam-strong text-left text-xs font-semibold text-ash">
      <tr>{children}</tr>
    </thead>
  );
}

/** Body wrapper with seam row dividers. */
export function AdminTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-seam">{children}</tbody>;
}

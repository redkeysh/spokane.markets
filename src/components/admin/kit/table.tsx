import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lookup and export tables: sentence-case headers, 36 px rows, 13/18 text, tabular numerals.
 * Work lists use List instead.
 */
export function Table({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table aria-label={label} className="w-full border-collapse font-text text-[13px]/[18px] text-basalt tabular-nums">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-seam-strong">{children}</tr>
    </thead>
  );
}

export type SortDirection = "ascending" | "descending" | "none";

/** A header cell. With `href` it is a sort link and carries aria-sort. */
export function TH({
  children,
  sort,
  href,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  sort?: SortDirection;
  href?: string;
  align?: "left" | "right";
  className?: string;
}) {
  const sortable = href !== undefined;
  return (
    <th
      scope="col"
      aria-sort={sortable ? (sort ?? "none") : undefined}
      className={cn(
        "h-9 px-3 font-text text-xs font-semibold whitespace-nowrap text-ash",
        align === "right" ? "text-right" : "text-left",
        className
      )}
    >
      {sortable ? (
        <Link
          href={href}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm hover:text-basalt",
            sort && sort !== "none" && "text-basalt"
          )}
        >
          {children}
          {sort && sort !== "none" && (
            <ChevronRight
              className={cn("size-3.5", sort === "ascending" ? "-rotate-90" : "rotate-90")}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
        </Link>
      ) : (
        children
      )}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("h-9 border-b border-seam hover:bg-hover", className)}>{children}</tr>;
}

export function TD({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return <td className={cn("px-3 py-1.5", align === "right" && "text-right", className)}>{children}</td>;
}

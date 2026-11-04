import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { adminButtonClass } from "@/components/admin/kit/button";

export { pageHref } from "./page-href";

/** "26 to 50 of 140" with Previous and Next. Renders nothing when everything fits on one page. */
export function Pager({
  page,
  limit,
  total,
  hrefFor,
  noun = "items",
}: {
  page: number;
  limit: number;
  total: number;
  hrefFor: (page: number) => string;
  /** Plural, e.g. "people". */
  noun?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);
  const quiet = adminButtonClass({ variant: "outline", size: "sm" });
  const off = `${quiet} pointer-events-none opacity-50`;
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <p className="font-text text-sm text-ash tabular-nums">
        {first} to {last} of {total} {noun}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={quiet}>
            <ChevronLeft strokeWidth={1.75} aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={off}>
            <ChevronLeft strokeWidth={1.75} aria-hidden="true" />
            Previous
          </span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={quiet}>
            Next
            <ChevronRight strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : (
          <span aria-disabled="true" className={off}>
            Next
            <ChevronRight strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}

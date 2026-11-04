import Link from "next/link";
import { adminButtonClass } from "@/components/admin/kit/button";

/** "Showing 51 to 100 of 132" with Previous and Next. Renders nothing when everything fits on one page. */
export function Pager({
  page,
  pageSize,
  total,
  hrefFor,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
  noun: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const quiet = adminButtonClass({ variant: "quiet", size: "sm" });
  return (
    <nav aria-label={`Pages of ${noun}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-xs text-ash tabular-nums">
        Showing {first} to {last} of {total} {noun}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={quiet} rel="prev">
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={quiet} rel="next">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

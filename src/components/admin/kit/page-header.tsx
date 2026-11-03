import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Optional back link, the page title with its actions on the same line, and an optional
 * one-line description. One filled button per pane: the actions hold at most one.
 */
export function PageHeader({
  title,
  back,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  /** "Back to Venues". */
  back?: { href: string; label: string };
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {back && (
        <Link
          href={back.href}
          className="inline-flex min-h-6 items-center self-start rounded-sm text-sm text-lilac underline-offset-4 hover:underline"
        >
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 font-display text-2xl/[30px] font-bold text-basalt">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <p className="max-w-[72ch] text-sm text-ash">{description}</p>}
    </div>
  );
}

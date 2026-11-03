import { cn } from "@/lib/utils";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const FULL = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * A tear-off calendar sheet: weekday on a fog band over the day number. `date` is a local
 * calendar date, "2026-11-07". A range shows its first day; the row's meta line says "+2 days".
 */
export function DateLeaf({ date, className }: { date: string; className?: string }) {
  const at = new Date(`${date}T12:00:00Z`);
  return (
    <time
      dateTime={date}
      className={cn(
        "inline-flex h-11 w-10 shrink-0 flex-col overflow-hidden rounded-[6px_6px_2px_2px] border border-seam-strong bg-sheet text-center",
        className
      )}
    >
      <span aria-hidden="true" className="block h-4 bg-fog font-display text-xs/[14px] font-bold text-ash">
        {WEEKDAY.format(at)}
      </span>
      <span
        aria-hidden="true"
        className="flex flex-1 items-center justify-center font-display text-lg/[18px] font-extrabold text-basalt tabular-nums"
      >
        {at.getUTCDate()}
      </span>
      <span className="sr-only">{FULL.format(at)}</span>
    </time>
  );
}

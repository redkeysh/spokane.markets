import Link from "next/link";
import { GroupHeading } from "@/components/admin/kit/list";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { Empty } from "@/components/admin/kit/empty";
import type { VendorEventRow, VendorEventsAt } from "@/lib/vendors/events-at";

function EventLine({ row, back }: { row: VendorEventRow; back?: string }) {
  return (
    <li className="grid gap-x-3 gap-y-0.5 border-b border-seam px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <Link
          href={`/admin/events/${row.id}${back ? `?from=vendors&back=${encodeURIComponent(back)}` : ""}`}
          className="rounded-sm text-sm font-medium text-basalt underline-offset-4 hover:text-lilac hover:underline"
        >
          {row.title}
        </Link>
        <p className="text-xs text-ash">
          <span className="tabular-nums">{row.when}</span>
          <span className="sr-only">. </span>
          <span className="ml-3">{row.links.join(", ")}</span>
        </p>
      </div>
      <div className="sm:pt-0.5">
        <StatusMark status={row.archived ? "ARCHIVED" : row.status} size="sm" />
      </div>
    </li>
  );
}

/**
 * Read-only: every event the vendor is linked to, by weekend, with each link in words. Past
 * events fold away under their own disclosure.
 */
export function VendorEvents({ eventsAt, back }: { eventsAt: VendorEventsAt; back?: string }) {
  if (eventsAt.upcoming.length === 0 && eventsAt.past.length === 0) {
    return (
      <Empty className="py-2" detail="Events show here when the vendor adds them to their profile, says they are going, or an organizer lists them.">
        Not linked to any event yet.
      </Empty>
    );
  }
  return (
    <div className="space-y-3">
      {eventsAt.upcoming.length === 0 && <p className="text-sm text-ash">Nothing coming up.</p>}
      {eventsAt.upcoming.map((week) => (
        <section key={week.saturday} aria-label={week.heading}>
          <GroupHeading as="h3" sticky={false} fact={`${week.events.length} ${week.events.length === 1 ? "event" : "events"}`} className="px-3">
            {week.heading}
          </GroupHeading>
          <ul role="list" className="border-t border-seam">
            {week.events.map((row) => (
              <EventLine key={row.id} row={row} back={back} />
            ))}
          </ul>
        </section>
      ))}
      {eventsAt.past.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-lilac">
            Past events <span className="text-ash tabular-nums">({eventsAt.past.length})</span>
          </summary>
          <ul role="list" className="mt-2 border-t border-seam">
            {eventsAt.past.map((row) => (
              <EventLine key={row.id} row={row} back={back} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

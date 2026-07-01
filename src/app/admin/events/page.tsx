import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateRangeInTimezone, cn } from "@/lib/utils";
import { DeleteButton, StatusButton } from "@/components/admin/action-buttons";
import { AdminEventTableRow } from "@/components/admin/admin-event-table-row";
import { Pagination } from "@/components/pagination";
import { deleteEvent, restoreEvent } from "../actions";
import Link from "next/link";
import type { EventStatus } from "@prisma/client";
import { parseAdminPagination, parseFlag, parseQuery, parseEnumParam } from "@/lib/admin/table-query";
import { buildAdminEventsWhere, resolveAdminEventsTimeScope } from "@/lib/admin/events-query";
import {
  buildAdminEventsOrderBy,
  parseAdminEventsSort,
  type AdminEventsSortField,
} from "@/lib/admin/events-list-order";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "DRAFT" },
  { label: "Pending Review", value: "PENDING" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELLED" },
] as const;

const statusVariant: Record<EventStatus, "info" | "warning" | "success" | "destructive" | "outline"> = {
  DRAFT: "info",
  PENDING: "warning",
  PUBLISHED: "success",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

const statusLabel: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending Review",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    limit?: string;
    archived?: string;
    past?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const statusFilter = parseEnumParam(
    params.status,
    ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "CANCELLED"] as const
  );
  const archived = parseFlag(params.archived);
  const past = parseFlag(params.past);
  const timeScope = resolveAdminEventsTimeScope({ archived, past });
  const q = parseQuery(params.q);
  const { page, limit } = parseAdminPagination(params);
  const { sort, dir } = parseAdminEventsSort({
    sort: params.sort,
    dir: params.dir,
    timeScope,
  });

  // Pin `now` once per request so count and findMany see the same cutoff.
  const now = new Date();
  const where = buildAdminEventsWhere({ statusFilter, timeScope, q, now });
  const orderBy = buildAdminEventsOrderBy({ sort, dir });
  const [total, events] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      include: { venue: { select: { name: true } } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  function buildEventsHref(overrides: {
    status?: string;
    page?: string;
    archived?: string;
    past?: string;
    q?: string;
    sort?: string;
    dir?: string;
    limit?: string;
  }) {
    const next = {
      status: statusFilter,
      page: page > 1 ? String(page) : undefined,
      archived: archived ? "1" : undefined,
      past: past ? "1" : undefined,
      q: q || undefined,
      sort,
      dir,
      limit: params.limit,
      ...overrides,
    };
    const qp = new URLSearchParams();
    if (next.status) qp.set("status", next.status);
    if (next.page) qp.set("page", next.page);
    if (next.archived) qp.set("archived", next.archived);
    if (next.past) qp.set("past", next.past);
    if (next.q) qp.set("q", next.q);
    if (next.sort) qp.set("sort", next.sort);
    if (next.dir) qp.set("dir", next.dir);
    if (next.limit) qp.set("limit", next.limit);
    const qs = qp.toString();
    return qs ? `/admin/events?${qs}` : "/admin/events";
  }

  function buildSortHref(column: AdminEventsSortField) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildEventsHref({ sort: column, dir: nextDir, page: "1" });
  }

  function renderSortIcon(column: AdminEventsSortField) {
    if (sort !== column) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />;
    return dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant={archived ? "default" : "outline"}>
            <Link href={archived ? buildEventsHref({ archived: undefined, page: "1" }) : buildEventsHref({ archived: "1", page: "1" })}>
              {archived ? "Hide all records" : "Show all records"}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/events/new">Create Event</Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <Link
          href={buildEventsHref({ archived: undefined, past: undefined, page: "1" })}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            !archived && timeScope === "active"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          Active
        </Link>
        <Link
          href={buildEventsHref({ archived: undefined, past: "1", page: "1" })}
          className={cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            !archived && timeScope === "past"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          Past
        </Link>
      </div>

      <form className="flex items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search title, slug, venue..." />
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        {archived && <input type="hidden" name="archived" value="1" />}
        {past && !archived && <input type="hidden" name="past" value="1" />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        {params.limit && <input type="hidden" name="limit" value={params.limit} />}
        <Button type="submit" variant="outline">Search</Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={`/api/admin/data/export/entity?entity=events${statusFilter ? `&status=${statusFilter}` : ""}${archived ? "&archived=1" : ""}${past && !archived ? "&past=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            Export CSV
          </Link>
        </Button>
      </form>

      <div className="flex gap-2 border-b border-border pb-2">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={buildEventsHref({ status: tab.value || undefined, page: "1" })}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md transition-colors",
              (statusFilter ?? "") === tab.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("title")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Title
                  {renderSortIcon("title")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("startDate")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Date
                  {renderSortIcon("startDate")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("venue")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Venue
                  {renderSortIcon("venue")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("status")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Status
                  {renderSortIcon("status")}
                </Link>
              </th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No events found.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <AdminEventTableRow
                  key={event.id}
                  href={`/admin/events/${event.id}/edit`}
                >
                  <td className="p-3 font-medium">{event.title}</td>
                  <td className="p-3 text-muted-foreground">
                    {formatDateRangeInTimezone(event.startDate, event.endDate, null)}
                  </td>
                  <td className="p-3 text-muted-foreground">{event.venue.name}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant[event.status]}>
                        {statusLabel[event.status]}
                      </Badge>
                      {event.deletedAt && <Badge variant="secondary">Archived</Badge>}
                      {!event.deletedAt && event.endDate < now && (
                        <Badge variant="secondary">Past</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2" data-row-action>
                    {event.deletedAt ? (
                      <StatusButton
                        action={restoreEvent.bind(null, event.id)}
                        label="Restore"
                        variant="outline"
                      />
                    ) : (
                      <DeleteButton
                        action={deleteEvent.bind(null, event.id)}
                        title="Archive event"
                        description={`Archive "${event.title}"? You can restore it later from archived events.`}
                        label="Archive"
                        confirmLabel="Archive"
                        pendingLabel="Archiving..."
                        iconOnly
                        iconName="recycle"
                      />
                    )}
                    </div>
                  </td>
                </AdminEventTableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}

import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteButton, StatusButton } from "@/components/admin/action-buttons";
import { AdminEventTableRow } from "@/components/admin/admin-event-table-row";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable } from "@/components/admin/admin-table";
import { Pagination } from "@/components/pagination";
import { deleteVenue, restoreVenue } from "../actions";
import Link from "next/link";
import { parseAdminPagination, parseFlag, parseQuery } from "@/lib/admin/table-query";
import {
  buildAdminVenuesOrderBy,
  parseAdminVenuesSort,
  type AdminVenuesSortField,
} from "@/lib/admin/venues-list-order";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminVenuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    archived?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const { page, limit } = parseAdminPagination(params);
  const archived = parseFlag(params.archived);
  const q = parseQuery(params.q);
  const { sort, dir } = parseAdminVenuesSort({
    sort: params.sort,
    dir: params.dir,
  });
  const where = {
    ...(archived ? {} : { deletedAt: null }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { address: { contains: q, mode: "insensitive" as const } },
            { city: { contains: q, mode: "insensitive" as const } },
            { neighborhood: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, venues] = await Promise.all([
    db.venue.count({ where }),
    db.venue.findMany({
      where,
      orderBy: buildAdminVenuesOrderBy({ sort, dir }),
      include: { _count: { select: { events: true } } },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  function buildVenuesHref(overrides: {
    page?: string;
    limit?: string;
    archived?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }) {
    const next = {
      page: page > 1 ? String(page) : undefined,
      limit: params.limit,
      archived: archived ? "1" : undefined,
      q: q || undefined,
      sort,
      dir,
      ...overrides,
    };
    const qp = new URLSearchParams();
    if (next.page) qp.set("page", next.page);
    if (next.limit) qp.set("limit", next.limit);
    if (next.archived) qp.set("archived", next.archived);
    if (next.q) qp.set("q", next.q);
    if (next.sort) qp.set("sort", next.sort);
    if (next.dir) qp.set("dir", next.dir);
    const qs = qp.toString();
    return qs ? `/admin/venues?${qs}` : "/admin/venues";
  }

  function buildSortHref(column: AdminVenuesSortField) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildVenuesHref({ sort: column, dir: nextDir, page: "1" });
  }

  function renderSortIcon(column: AdminVenuesSortField) {
    if (sort !== column) return <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />;
    return dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Venues"
        actions={
          <>
            <Button asChild variant={archived ? "default" : "outline"}>
              <Link
                href={
                  archived
                    ? buildVenuesHref({ archived: undefined, page: "1" })
                    : buildVenuesHref({ archived: "1", page: "1" })
                }
              >
                {archived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/venues/new">Create Venue</Link>
            </Button>
          </>
        }
      />

      <form className="flex items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search venue, address, city..." />
        {archived && <input type="hidden" name="archived" value="1" />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        {params.limit && <input type="hidden" name="limit" value={params.limit} />}
        <Button type="submit" variant="outline">Search</Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={`/api/admin/data/export/entity?entity=venues${archived ? "&archived=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            Export CSV
          </Link>
        </Button>
      </form>

      <AdminTable>
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("name")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Name
                  {renderSortIcon("name")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("address")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Address
                  {renderSortIcon("address")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("neighborhood")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Neighborhood
                  {renderSortIcon("neighborhood")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("events")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Events
                  {renderSortIcon("events")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("status")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  State
                  {renderSortIcon("status")}
                </Link>
              </th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {venues.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No venues found.
                </td>
              </tr>
            ) : (
              venues.map((venue) => (
                <AdminEventTableRow key={venue.id} href={`/admin/venues/${venue.id}/edit`}>
                  <td className="p-3 font-medium">{venue.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {venue.address}, {venue.city}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {venue.neighborhood ?? "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {venue._count.events}
                  </td>
                  <td className="p-3">
                    {venue.deletedAt ? <Badge variant="secondary">Archived</Badge> : "Active"}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2" data-row-action>
                    {venue.deletedAt ? (
                      <StatusButton
                        action={restoreVenue.bind(null, venue.id)}
                        label="Restore"
                        variant="outline"
                      />
                    ) : (
                      <DeleteButton
                        action={deleteVenue.bind(null, venue.id)}
                        title="Archive venue"
                        description={`Archive "${venue.name}"? You can restore it later from archived venues.`}
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
      </AdminTable>
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}

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
import { deleteMarket, restoreMarket, verifyMarket } from "../actions";
import Link from "next/link";
import type { VerificationStatus } from "@prisma/client";
import { parseAdminPagination, parseFlag, parseQuery } from "@/lib/admin/table-query";
import {
  buildAdminMarketsOrderBy,
  parseAdminMarketsSort,
  type AdminMarketsSortField,
} from "@/lib/admin/markets-list-order";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export const dynamic = "force-dynamic";

const verificationVariant: Record<VerificationStatus, "secondary" | "default" | "outline"> = {
  UNVERIFIED: "secondary",
  PENDING: "outline",
  VERIFIED: "default",
};

export default async function AdminMarketsPage({
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
  const { sort, dir } = parseAdminMarketsSort({
    sort: params.sort,
    dir: params.dir,
  });
  const where = {
    ...(archived ? {} : { deletedAt: null }),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { baseArea: { contains: q, mode: "insensitive" as const } },
            {
              owner: {
                OR: [
                  { name: { contains: q, mode: "insensitive" as const } },
                  { email: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [total, markets] = await Promise.all([
    db.market.count({ where }),
    db.market.findMany({
      where,
      orderBy: buildAdminMarketsOrderBy({ sort, dir }),
      include: {
        _count: { select: { events: true } },
        owner: { select: { name: true, email: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  function buildMarketsHref(overrides: {
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
    return qs ? `/admin/markets?${qs}` : "/admin/markets";
  }

  function buildSortHref(column: AdminMarketsSortField) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildMarketsHref({ sort: column, dir: nextDir, page: "1" });
  }

  function renderSortIcon(column: AdminMarketsSortField) {
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
        title="Markets"
        actions={
          <>
            <Button asChild variant={archived ? "default" : "outline"}>
              <Link
                href={
                  archived
                    ? buildMarketsHref({ archived: undefined, page: "1" })
                    : buildMarketsHref({ archived: "1", page: "1" })
                }
              >
                {archived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/markets/new">Create Market</Link>
            </Button>
          </>
        }
      />

      <form className="flex items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search market, slug, owner..." />
        {archived && <input type="hidden" name="archived" value="1" />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        {params.limit && <input type="hidden" name="limit" value={params.limit} />}
        <Button type="submit" variant="outline">Search</Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={`/api/admin/data/export/entity?entity=markets${archived ? "&archived=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
                <Link href={buildSortHref("baseArea")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Area
                  {renderSortIcon("baseArea")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("owner")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Owner
                  {renderSortIcon("owner")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("verificationStatus")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Status
                  {renderSortIcon("verificationStatus")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("managed")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Ownership
                  {renderSortIcon("managed")}
                </Link>
              </th>
              <th className="text-left p-3 font-medium">
                <Link href={buildSortHref("events")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Events
                  {renderSortIcon("events")}
                </Link>
              </th>
              <th className="text-right p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {markets.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No markets found.
                </td>
              </tr>
            ) : (
              markets.map((market) => (
                <AdminEventTableRow key={market.id} href={`/admin/markets/${market.id}/edit`}>
                  <td className="p-3 font-medium">{market.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {market.baseArea ?? "—"}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {market.owner?.name || market.owner?.email || "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={verificationVariant[market.verificationStatus]}>
                        {market.verificationStatus}
                      </Badge>
                      {market.deletedAt && <Badge variant="secondary">Archived</Badge>}
                    </div>
                  </td>
                  <td className="p-3">
                    <Badge variant={market.ownerId ? "default" : "secondary"}>
                      {market.ownerId ? "Managed" : "Unassigned"}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {market._count.events}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2" data-row-action>
                    {market.verificationStatus !== "VERIFIED" && !market.deletedAt && (
                      <StatusButton
                        action={verifyMarket.bind(null, market.id)}
                        label="Verify"
                      />
                    )}
                    {market.deletedAt ? (
                      <StatusButton
                        action={restoreMarket.bind(null, market.id)}
                        label="Restore"
                        variant="outline"
                      />
                    ) : (
                      <DeleteButton
                        action={deleteMarket.bind(null, market.id)}
                        title="Archive market"
                        description={`Archive "${market.name}"? You can restore it later from archived markets.`}
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

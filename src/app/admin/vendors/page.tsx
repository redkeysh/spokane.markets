import Link from "next/link";
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
import { deleteVendor, restoreVendor, verifyVendor } from "../actions";
import { parseAdminPagination, parseFlag, parseQuery } from "@/lib/admin/table-query";
import type { VerificationStatus } from "@prisma/client";
import {
  buildAdminVendorsOrderBy,
  parseAdminVendorsSort,
  type AdminVendorsSortField,
} from "@/lib/admin/vendors-list-order";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

const verificationVariant: Record<VerificationStatus, "secondary" | "default" | "outline"> = {
  UNVERIFIED: "secondary",
  PENDING: "outline",
  VERIFIED: "default",
};

export const dynamic = "force-dynamic";

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    orphaned?: string;
    archived?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const { page, limit } = parseAdminPagination(params);
  const orphanedOnly = parseFlag(params.orphaned);
  const archived = parseFlag(params.archived);
  const q = parseQuery(params.q);
  const { sort, dir } = parseAdminVendorsSort({
    sort: params.sort,
    dir: params.dir,
  });

  const where = {
    ...(orphanedOnly ? { userId: null } : {}),
    ...(archived ? {} : { deletedAt: null }),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { specialties: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, vendors] = await Promise.all([
    db.vendorProfile.count({ where }),
    db.vendorProfile.findMany({
      where,
      orderBy: buildAdminVendorsOrderBy({ sort, dir }),
      include: {
        _count: { select: { vendorEvents: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  function buildVendorsHref(overrides: {
    page?: string;
    limit?: string;
    orphaned?: string;
    archived?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }) {
    const next = {
      page: page > 1 ? String(page) : undefined,
      limit: params.limit,
      orphaned: orphanedOnly ? "1" : undefined,
      archived: archived ? "1" : undefined,
      q: q || undefined,
      sort,
      dir,
      ...overrides,
    };
    const qp = new URLSearchParams();
    if (next.page) qp.set("page", next.page);
    if (next.limit) qp.set("limit", next.limit);
    if (next.orphaned) qp.set("orphaned", next.orphaned);
    if (next.archived) qp.set("archived", next.archived);
    if (next.q) qp.set("q", next.q);
    if (next.sort) qp.set("sort", next.sort);
    if (next.dir) qp.set("dir", next.dir);
    const qs = qp.toString();
    return qs ? `/admin/vendors?${qs}` : "/admin/vendors";
  }

  function buildSortHref(column: AdminVendorsSortField) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    return buildVendorsHref({ sort: column, dir: nextDir, page: "1" });
  }

  function renderSortIcon(column: AdminVendorsSortField) {
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
        title="Vendors"
        description="Manage vendor profiles. Create, edit, or delete."
        actions={
          <>
            <Button
              variant={orphanedOnly ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link
                href={
                  orphanedOnly
                    ? buildVendorsHref({ orphaned: undefined, page: "1" })
                    : buildVendorsHref({ orphaned: "1", page: "1" })
                }
              >
                {orphanedOnly ? "All vendors" : "Unlinked only"}
              </Link>
            </Button>
            <Button variant={archived ? "default" : "outline"} size="sm" asChild>
              <Link
                href={
                  archived
                    ? buildVendorsHref({ archived: undefined, page: "1" })
                    : buildVendorsHref({ archived: "1", page: "1" })
                }
              >
                {archived ? "Hide archived" : "Show archived"}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/vendors/new">Create Vendor</Link>
            </Button>
          </>
        }
      />

      <form className="flex items-center gap-2">
        <Input name="q" defaultValue={q} placeholder="Search business, slug, specialty..." />
        {orphanedOnly && <input type="hidden" name="orphaned" value="1" />}
        {archived && <input type="hidden" name="archived" value="1" />}
        {params.sort && <input type="hidden" name="sort" value={params.sort} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        {params.limit && <input type="hidden" name="limit" value={params.limit} />}
        <Button type="submit" variant="outline">Search</Button>
        <Button type="button" variant="outline" asChild>
          <Link
            href={`/api/admin/data/export/entity?entity=vendors${orphanedOnly ? "&orphaned=1" : ""}${archived ? "&archived=1" : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
          >
            Export CSV
          </Link>
        </Button>
      </form>

      <AdminTable>
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("businessName")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Business Name
                  {renderSortIcon("businessName")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("slug")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Slug
                  {renderSortIcon("slug")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("specialties")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Specialties
                  {renderSortIcon("specialties")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("verificationStatus")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Verification
                  {renderSortIcon("verificationStatus")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("managed")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Ownership
                  {renderSortIcon("managed")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <Link href={buildSortHref("events")} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  Events
                  {renderSortIcon("events")}
                </Link>
              </th>
              <th className="px-4 py-3 text-left font-medium">Link</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No vendor profiles yet.
                </td>
              </tr>
            ) : (
              vendors.map((v) => (
                <AdminEventTableRow key={v.id} href={`/admin/vendors/${v.id}/edit`}>
                  <td className="px-4 py-3 font-medium">{v.businessName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                    {v.specialties ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={verificationVariant[v.verificationStatus]}>
                      {v.verificationStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={v.userId ? "default" : "secondary"}>
                        {v.userId ? "Managed" : "Unassigned"}
                      </Badge>
                      {v.deletedAt && <Badge variant="secondary">Archived</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{v._count.vendorEvents}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/vendors/${v.slug}`}
                      data-row-action
                      className="text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2" data-row-action>
                    {v.verificationStatus !== "VERIFIED" && !v.deletedAt && (
                      <StatusButton
                        action={verifyVendor.bind(null, v.id)}
                        label="Verify"
                      />
                    )}
                    {v.deletedAt ? (
                      <StatusButton
                        action={restoreVendor.bind(null, v.id)}
                        label="Restore"
                        variant="outline"
                      />
                    ) : (
                      <DeleteButton
                        action={deleteVendor.bind(null, v.id)}
                        title="Archive vendor"
                        description={`Archive "${v.businessName}"? You can restore it later from archived vendors.`}
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

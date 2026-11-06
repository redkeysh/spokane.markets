import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  countEventsByVendor,
  parseVendorListParams,
  VENDOR_PAGE_SIZE,
  VENDOR_SHOW_LABELS,
  vendorEmptyMessage,
  vendorExport,
  vendorListHref,
  vendorListWhere,
} from "@/lib/vendors/admin-list";
import { adminButtonClass, AdminLinkButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pager } from "@/components/admin/vendors/pager";
import { VendorFilters } from "@/components/admin/vendors/vendor-filters";
import { VendorList, type VendorRowData } from "@/components/admin/vendors/vendor-list";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { show } = parseVendorListParams(await searchParams);
  return { title: show === "all" ? "Vendors" : `Vendors: ${VENDOR_SHOW_LABELS[show].toLowerCase()}` };
}

export default async function AdminVendorsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const params = parseVendorListParams(await searchParams);
  const where = vendorListWhere(params);

  const [total, vendors] = await Promise.all([
    db.vendorProfile.count({ where }),
    db.vendorProfile.findMany({
      where,
      orderBy: [{ businessName: "asc" }, { id: "asc" }],
      skip: (params.page - 1) * VENDOR_PAGE_SIZE,
      take: VENDOR_PAGE_SIZE,
      select: {
        id: true,
        businessName: true,
        slug: true,
        specialties: true,
        verificationStatus: true,
        deletedAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  if (vendors.length === 0 && total > 0 && params.page > 1) {
    redirect(vendorListHref({ ...params, page: Math.ceil(total / VENDOR_PAGE_SIZE) }));
  }

  const ids = vendors.map((v) => v.id);
  const liveEvent = { deletedAt: null };
  const [listed, intents, roster] = ids.length
    ? await Promise.all([
        db.vendorEvent.findMany({ where: { vendorProfileId: { in: ids }, event: liveEvent }, select: { vendorProfileId: true, eventId: true } }),
        db.eventVendorIntent.findMany({ where: { vendorProfileId: { in: ids }, event: liveEvent }, select: { vendorProfileId: true, eventId: true } }),
        db.eventVendorRoster.findMany({ where: { vendorProfileId: { in: ids }, event: liveEvent }, select: { vendorProfileId: true, eventId: true } }),
      ])
    : [[], [], []];
  const eventCounts = countEventsByVendor([...listed, ...intents, ...roster]);

  const rows: VendorRowData[] = vendors.map((v) => ({
    id: v.id,
    businessName: v.businessName,
    slug: v.slug,
    specialties: v.specialties,
    verificationStatus: v.verificationStatus,
    owner: v.user,
    eventsCount: eventCounts.get(v.id) ?? 0,
    archived: v.deletedAt !== null,
  }));
  const filtered = Boolean(params.q) || params.show !== "all";
  const back = vendorListHref(params);
  const csv = vendorExport(params);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vendors"
        actions={
          <>
            <a href={csv.href} download className={adminButtonClass({ variant: "quiet", size: "md" })}>
              {csv.label}
            </a>
            <AdminLinkButton href="/admin/vendors/new" variant="ink">
              New vendor
            </AdminLinkButton>
          </>
        }
      />
      <VendorFilters q={params.q} show={params.show} total={total} />

      {rows.length > 0 ? (
        <div>
          <VendorList rows={rows} back={back} />
          <Pager
            page={params.page}
            pageSize={VENDOR_PAGE_SIZE}
            total={total}
            noun="vendors"
            hrefFor={(page) => vendorListHref({ ...params, page })}
          />
        </div>
      ) : (
        <Empty
          detail={filtered ? undefined : "Vendors appear here when they make a profile on the site, or when you add one."}
        >
          {vendorEmptyMessage(params)}
        </Empty>
      )}
    </div>
  );
}

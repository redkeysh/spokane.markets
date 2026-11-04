import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { parseEnumParam } from "@/lib/admin/table-query";
import { PageHeader } from "@/components/admin/kit/page-header";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { UrlFilters } from "@/components/admin/rare/url-filters";
import { RenderRows } from "@/components/admin/marketing/render-rows";
import { RENDER_STATUS_ORDER, RENDER_STATUS_WORDS } from "@/components/admin/marketing/words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Past graphics" };

export default async function MarketingAssetStudioHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; renderId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const statusFilter = parseEnumParam(params.status?.trim() ?? "", RENDER_STATUS_ORDER);
  const renders = await db.marketingRender.findMany({
    where: {
      deletedAt: null,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q
        ? {
            OR: [
              { template: { name: { contains: q, mode: "insensitive" } } },
              { template: { slug: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      template: { select: { name: true } },
      user: { select: { name: true, email: true } },
      vendor: { select: { businessName: true } },
      event: { select: { title: true } },
      market: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const statusWord = statusFilter ? RENDER_STATUS_WORDS[statusFilter].word.toLowerCase() : null;
  const emptyMessage = q
    ? `No graphic made from a template matching "${q}"${statusWord ? ` is ${statusWord}` : ""}.`
    : statusWord
      ? `No graphic is ${statusWord}.`
      : "No graphics made yet.";

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-5">
      <PageHeader
        back={{ href: "/admin/marketing/asset-studio", label: "Back to Graphics" }}
        title="Past graphics"
        description="Download a graphic again, make another like it, or delete it."
        actions={
          <AdminLinkButton href="/admin/marketing/asset-studio/new" variant="ink">
            New graphic
          </AdminLinkButton>
        }
      />

      <UrlFilters
        label="Filter past graphics"
        search={{ label: "Search template name", placeholder: "Search template name" }}
        selects={[
          {
            name: "status",
            label: "Showing",
            options: [
              { value: "", label: "Every graphic" },
              ...RENDER_STATUS_ORDER.map((s) => ({ value: s, label: RENDER_STATUS_WORDS[s].word })),
            ],
          },
        ]}
      />

      {renders.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <RenderRows renders={renders} label="Past graphics" focusedId={params.renderId} />
      )}
    </div>
  );
}

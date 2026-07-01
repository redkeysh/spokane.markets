import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteRenderButton } from "@/components/admin/marketing/delete-render-button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable } from "@/components/admin/admin-table";
import { parseEnumParam } from "@/lib/admin/table-query";

export const dynamic = "force-dynamic";

export default async function MarketingAssetStudioHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; renderId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const statusFilter = parseEnumParam(status, [
    "QUEUED",
    "PROCESSING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
  ] as const);
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
      template: { select: { id: true, name: true, slug: true, profile: true } },
      user: { select: { name: true, email: true } },
      vendor: { select: { businessName: true } },
      event: { select: { title: true } },
      market: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Render History"
        description="Re-download, duplicate, or delete past renders."
        actions={
          <Button asChild>
            <Link href="/admin/marketing/asset-studio/new">New Render</Link>
          </Button>
        }
      />

      <form className="flex items-center gap-2">
        <Input name="q" placeholder="Search template name or slug..." defaultValue={q} />
        <Input name="status" placeholder="Status (QUEUED, SUCCEEDED...)" defaultValue={status} />
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      <AdminTable>
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Template</th>
              <th className="px-4 py-3 text-left font-medium">Entity</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Scale</th>
              <th className="px-4 py-3 text-left font-medium">By</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {renders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No renders found.
                </td>
              </tr>
            ) : (
              renders.map((render) => {
                const entityLabel = render.vendor?.businessName || render.event?.title || render.market?.name || "Manual";
                const isFocused = params.renderId === render.id;
                return (
                  <tr
                    key={render.id}
                    className={`border-t border-border ${isFocused ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3">{render.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-3">{render.template.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{entityLabel}</td>
                    <td className="px-4 py-3">
                      <Badge variant={render.status === "SUCCEEDED" ? "default" : "outline"}>{render.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{render.scale}x</td>
                    <td className="px-4 py-3">{render.user.name ?? render.user.email ?? "Unknown"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/api/admin/marketing/renders/${render.id}/download`} target="_blank">
                            Download
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/marketing/asset-studio/new?duplicateRenderId=${render.id}`}>
                            Duplicate
                          </Link>
                        </Button>
                        <DeleteRenderButton renderId={render.id} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
      </AdminTable>
    </div>
  );
}

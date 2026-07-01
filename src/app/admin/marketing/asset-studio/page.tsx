import Link from "next/link";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable } from "@/components/admin/admin-table";

export const dynamic = "force-dynamic";

function profileLabel(profile: "SQUARE" | "IG_STORY"): string {
  return profile === "IG_STORY" ? "9:16 (IG Story)" : "1:1 (Square)";
}

export default async function MarketingAssetStudioPage() {
  await requireAdmin();
  const [templates, recentRenders] = await Promise.all([
    db.marketingTemplate.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { renders: true } } },
    }),
    db.marketingRender.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        template: { select: { id: true, name: true, slug: true } },
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Marketing Asset Studio"
        description="Pick a template, prefill from vendor/event/market records, and queue supersampled renders."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/marketing/asset-studio/history">History</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/admin/marketing/asset-studio/templates">Manage Templates</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/marketing/asset-studio/new">New Render</Link>
            </Button>
          </>
        }
      />

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.length === 0 ? (
            <div className="rounded-lg border border-border p-6 text-muted-foreground">
              No templates yet. Add one from Manage Templates.
            </div>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{template.name}</p>
                    <p className="text-xs text-muted-foreground">{template.slug}</p>
                  </div>
                  <Badge variant="outline">{template.category}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{profileLabel(template.profile)}</Badge>
                  <Badge variant="secondary">Scale default: {template.defaultScale}x</Badge>
                  <Badge variant="secondary">Renders: {template._count.renders}</Badge>
                </div>
                <div className="flex items-center justify-end">
                  <Button size="sm" asChild>
                    <Link href={`/admin/marketing/asset-studio/new?templateId=${template.id}`}>Use template</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recent Renders</h2>
          <Link href="/admin/marketing/asset-studio/history" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <AdminTable>
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="px-4 py-3 text-left font-medium">Template</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Scale</th>
                <th className="px-4 py-3 text-left font-medium">By</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentRenders.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No renders yet.
                  </td>
                </tr>
              ) : (
                recentRenders.map((render) => (
                  <tr key={render.id} className="border-t border-border">
                    <td className="px-4 py-3 text-muted-foreground">{render.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-3">{render.template.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={render.status === "SUCCEEDED" ? "default" : "outline"}>{render.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{render.scale}x</td>
                    <td className="px-4 py-3">{render.user.name ?? render.user.email ?? "Unknown"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/marketing/asset-studio/history?renderId=${render.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
        </AdminTable>
      </section>
    </div>
  );
}

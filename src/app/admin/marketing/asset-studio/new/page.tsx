import { requireAdmin } from "@/lib/auth-utils";
import { MarketingRenderEditor } from "@/components/admin/marketing/marketing-render-editor";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function MarketingAssetStudioNewPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="New Marketing Render"
        description="Select a template, prefill variables from entities, edit in-place, and queue a supersampled render."
        breadcrumbs={[
          { label: "Asset Studio", href: "/admin/marketing/asset-studio" },
          { label: "New render" },
        ]}
      />
      <MarketingRenderEditor />
    </div>
  );
}

import { requireAdmin } from "@/lib/auth-utils";
import { MarketingTemplatesManager } from "@/components/admin/marketing/marketing-templates-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function MarketingTemplateManagerPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Template Registry"
        description="Maintain runtime templates, placeholder schemas, and render profiles."
      />
      <MarketingTemplatesManager />
    </div>
  );
}

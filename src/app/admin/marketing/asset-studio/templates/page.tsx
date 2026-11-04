import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { PageHeader } from "@/components/admin/kit/page-header";
import { MarketingTemplatesManager } from "@/components/admin/marketing/marketing-templates-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Templates" };

export default async function MarketingTemplateManagerPage() {
  await requireAdmin();
  return (
    <div className="mx-auto w-full max-w-[1184px]">
      <div className="max-w-[984px] space-y-8">
        <PageHeader
          back={{ href: "/admin/marketing/asset-studio", label: "Back to Graphics" }}
          title="Templates"
          description="The designs graphics are made from."
        />
        <MarketingTemplatesManager />
      </div>
    </div>
  );
}

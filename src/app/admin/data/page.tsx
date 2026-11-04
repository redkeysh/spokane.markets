import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { PageHeader } from "@/components/admin/kit/page-header";
import { DataImportExport } from "@/components/admin/data-import-export";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Import and export",
  description: "Import events, markets and places from a file, or export a backup of everything.",
};

export default async function AdminDataPage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-[1184px]">
      <div className="max-w-[784px] space-y-8">
        <PageHeader
          title="Import and export"
          description="Bring in events, markets and places from a file, or save a copy of everything."
        />
        <DataImportExport />
      </div>
    </div>
  );
}

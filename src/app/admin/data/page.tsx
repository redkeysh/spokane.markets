import { requireAdmin } from "@/lib/auth-utils";
import { DataImportExport } from "@/components/admin/data-import-export";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Data Import / Export - Admin",
  description: "Import events, markets, and venues from JSON or CSV. Export backup to host.",
};

export default async function AdminDataPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Data Import & Export"
        description="Import events, markets, and venues from JSON or CSV. Export a full backup to the host."
      />

      <DataImportExport />
    </div>
  );
}

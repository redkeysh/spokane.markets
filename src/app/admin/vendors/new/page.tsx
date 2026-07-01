import { requireAdmin } from "@/lib/auth-utils";
import { AdminVendorForm } from "@/components/admin/vendor-form";
import { getListingCommunityBadgeOptions } from "@/lib/listing-community-badges";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function NewVendorPage() {
  await requireAdmin();
  const listingCommunityBadgeOptions = await getListingCommunityBadgeOptions();

  return (
    <div className="max-w-7xl space-y-6">
      <AdminPageHeader
        title="Create Vendor"
        breadcrumbs={[
          { label: "Vendors", href: "/admin/vendors" },
          { label: "New vendor" },
        ]}
      />
      <AdminVendorForm listingCommunityBadgeOptions={listingCommunityBadgeOptions} />
    </div>
  );
}

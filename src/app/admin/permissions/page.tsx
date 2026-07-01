import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import {
  DEFAULT_ADMIN_PERMISSION_MATRIX,
  normalizePermissionMatrix,
} from "@/lib/admin/permissions";
import { PermissionsMatrix } from "@/components/admin/permissions-matrix";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function AdminPermissionsPage() {
  await requireAdminPermission("admin.roles.manage");
  const row = await db.siteConfig.findUnique({
    where: { key: "admin_permissions_matrix" },
  });
  const initialMatrix = row?.value
    ? normalizePermissionMatrix(JSON.parse(row.value))
    : DEFAULT_ADMIN_PERMISSION_MATRIX;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Permissions"
        description="Configure granular permissions per role for the admin surface."
      />
      <PermissionsMatrix initialMatrix={initialMatrix} />
    </div>
  );
}


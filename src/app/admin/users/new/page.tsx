import { requireAdmin } from "@/lib/auth-utils";
import { UserForm } from "@/components/admin/user-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Create User"
        description="Add a new user account. They can sign in with the email and password you set."
        breadcrumbs={[
          { label: "Users", href: "/admin/users" },
          { label: "New user" },
        ]}
      />
      <UserForm />
    </div>
  );
}

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { PageHeader } from "@/components/admin/kit/page-header";
import { UserForm } from "@/components/admin/user-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New user" };

export default async function NewUserPage() {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-[1184px]">
      <div className="max-w-[656px] space-y-8">
        <PageHeader
          back={{ href: "/admin/users", label: "Back to Users" }}
          title="New user"
          description="They sign in with the email and password you set here."
        />
        <UserForm />
      </div>
    </div>
  );
}

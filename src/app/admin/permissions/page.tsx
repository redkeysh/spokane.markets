import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";

export const dynamic = "force-dynamic";

export default async function AdminPermissionsPage() {
  await requireAdmin();
  redirect("/admin/users");
}

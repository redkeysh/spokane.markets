import { requireAdmin } from "@/lib/auth-utils";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminSubnav } from "@/components/admin/admin-subnav";
import { getModerationPendingCount } from "@/lib/admin/queues";
import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";

export const metadata = {
  title: `Admin · ${SITE_NAME}`,
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const moderationCount = await getModerationPendingCount();

  return (
    <div data-theme="admin" className="flex min-h-screen bg-background">
      <AdminSidebar moderationCount={moderationCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-4 border-b border-border px-4 lg:px-8">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            View site
          </Link>
        </header>
        <AdminSubnav />
        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

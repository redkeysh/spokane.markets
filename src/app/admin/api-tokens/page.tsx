import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatRelativeTime } from "@/lib/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ApiTokensManager, type ApiTokenRow } from "@/components/admin/api-tokens-manager";

export const dynamic = "force-dynamic";

const formatDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Los_Angeles",
}).format;

function tokenStatus(t: { revokedAt: Date | null; expiresAt: Date | null }): ApiTokenRow["status"] {
  if (t.revokedAt) return "revoked";
  if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return "expired";
  return "active";
}

export default async function AdminApiTokensPage() {
  await requireAdminPermission("admin.settings.manage");

  const tokens = await db.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      prefix: true,
      access: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const rows: ApiTokenRow[] = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    access: t.access,
    owner: t.user.name ?? t.user.email,
    created: formatDay(t.createdAt),
    lastUsed: t.lastUsedAt ? formatRelativeTime(t.lastUsedAt) : null,
    expires: t.expiresAt ? formatDay(t.expiresAt) : null,
    status: tokenStatus(t),
  }));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <div className="max-w-[1600px] space-y-6">
      <AdminPageHeader
        title="API Tokens"
        description="Let an AI assistant such as Claude work with the catalog and moderation queue through the admin MCP server."
      />
      <ApiTokensManager tokens={rows} mcpUrl={`${appUrl}/api/admin/mcp`} />
    </div>
  );
}

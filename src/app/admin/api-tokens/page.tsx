import type { Metadata } from "next";
import { requireAdminPermission } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatRelativeTime } from "@/lib/utils";
import { formatFullDate, pacificDate } from "@/lib/admin/format";
import { PageHeader } from "@/components/admin/kit/page-header";
import { ApiTokensManager, type ApiTokenRow } from "@/components/admin/api-tokens-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API tokens" };

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
    created: formatFullDate(pacificDate(t.createdAt)),
    lastUsed: t.lastUsedAt ? formatRelativeTime(t.lastUsedAt) : null,
    expires: t.expiresAt ? formatFullDate(pacificDate(t.expiresAt)) : null,
    status: tokenStatus(t),
  }));

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-8">
      <PageHeader
        title="API tokens"
        description="Let an AI assistant such as Claude work with the listings through the admin's MCP server."
      />
      <ApiTokensManager tokens={rows} mcpUrl={`${appUrl}/api/admin/mcp`} />
    </div>
  );
}

import type { Metadata } from "next";
import type { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { parseAdminPagination } from "@/lib/admin/table-query";
import { formatFullDate, pacificDate } from "@/lib/admin/format";
import { PageHeader } from "@/components/admin/kit/page-header";
import { AdminLinkButton } from "@/components/admin/kit/button";
import { List, ListRow } from "@/components/admin/kit/list";
import { Empty } from "@/components/admin/kit/empty";
import { UserFilters } from "@/components/admin/user-filters";
import { Pager, pageHref } from "@/components/admin/rare/pager";
import { ROLE_WORDS, STATUS_WORDS, userCounts } from "@/components/admin/user-words";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Users" };

const ROLES: readonly Role[] = ["USER", "VENDOR", "ORGANIZER", "ADMIN"];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; q?: string; role?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const { page, limit } = parseAdminPagination(params);
  const q = (params.q ?? "").trim();
  const roleParam = params.role ?? "";
  const roleFilter = (ROLES as readonly string[]).includes(roleParam) ? (roleParam as Role) : undefined;

  const whereConditions = [];
  if (q) {
    whereConditions.push({
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  if (roleFilter) {
    whereConditions.push({ role: roleFilter });
  }
  const where = whereConditions.length > 0 ? { AND: whereConditions } : undefined;

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { ownedMarkets: { where: { deletedAt: null } }, reviews: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const filtered = Boolean(q || roleFilter);
  const roleWord = roleFilter ? ROLE_WORDS[roleFilter].plural.toLowerCase() : null;
  const emptyMessage = q
    ? roleWord
      ? `No ${roleWord} match "${q}".`
      : `No one matches "${q}".`
    : roleWord
      ? `There are no ${roleWord}.`
      : "No one has an account yet.";

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-5">
      <PageHeader
        title="Users"
        description="Everyone with an account. Roles and sign-in access are set on each person's page."
        actions={
          <AdminLinkButton href="/admin/users/new" variant="ink">
            New user
          </AdminLinkButton>
        }
      />

      <UserFilters />

      {users.length === 0 ? (
        <Empty>{emptyMessage}</Empty>
      ) : (
        <List label={filtered ? "Matching people" : "People"}>
          {users.map((user) => {
            const counts = userCounts(user._count.ownedMarkets, user._count.reviews);
            const blocked = user.accountStatus !== "ACTIVE";
            return (
              <ListRow
                key={user.id}
                rowKey={user.id}
                href={`/admin/users/${user.id}`}
                title={user.name?.trim() || user.email}
                meta={
                  <span className="tabular-nums">
                    {[user.name?.trim() ? user.email : null, `joined ${formatFullDate(pacificDate(user.createdAt))}`, counts]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                }
                status={
                  <span className="flex flex-col items-end gap-0.5 text-right font-text text-sm font-medium text-basalt">
                    {ROLE_WORDS[user.role].one}
                    {blocked && <span className="text-xs text-ponderosa">{STATUS_WORDS[user.accountStatus]}</span>}
                  </span>
                }
              />
            );
          })}
        </List>
      )}

      <Pager
        page={page}
        limit={limit}
        total={total}
        noun="people"
        hrefFor={(p) => pageHref("/admin/users", { q: q || undefined, role: roleFilter, limit: params.limit }, p)}
      />
    </div>
  );
}

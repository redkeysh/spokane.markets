import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserDeleteButton } from "@/components/admin/user-delete-button";
import { UserResetPasswordButton } from "@/components/admin/user-reset-password-button";
import { UserAccountStatusSelect } from "@/components/admin/user-account-status-select";
import { Pagination } from "@/components/pagination";
import { UserFilters } from "@/components/admin/user-filters";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { parseAdminPagination } from "@/lib/admin/table-query";

export const dynamic = "force-dynamic";

const ROLES: { label: string; value: Role | "" }[] = [
  { label: "All roles", value: "" },
  { label: "User", value: "USER" },
  { label: "Vendor", value: "VENDOR" },
  { label: "Organizer", value: "ORGANIZER" },
  { label: "Admin", value: "ADMIN" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; q?: string; role?: string }>;
}) {
  const session = await requireAdmin();

  const params = await searchParams;
  const { page, limit } = parseAdminPagination(params);
  const q = (params.q ?? "").trim();
  const roleParam = params.role ?? "";
  const roleFilter = ["USER", "VENDOR", "ORGANIZER", "ADMIN"].includes(roleParam)
    ? (roleParam as Role)
    : undefined;

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
          select: { ownedMarkets: true, reviews: true },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="mt-1 text-muted-foreground">
            Manage user accounts and roles. Changing a role affects what dashboards and features the user can access.
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create user
        </Link>
      </div>

      <UserFilters q={q} role={roleParam || ""} roles={ROLES} />

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Role</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Markets</th>
              <th className="text-left p-3 font-medium">Reviews</th>
              <th className="text-left p-3 font-medium">Joined</th>
              <th className="w-20 p-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-primary hover:underline"
                    >
                      {user.name ?? user.email}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{user.email}</td>
                  <td className="p-3">
                    <UserRoleSelect
                      userId={user.id}
                      currentRole={user.role}
                    />
                  </td>
                  <td className="p-3">
                    <UserAccountStatusSelect
                      userId={user.id}
                      currentStatus={user.accountStatus}
                    />
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {user._count.ownedMarkets > 0 ? (
                      <Link
                        href="/admin/markets"
                        className="text-primary hover:underline"
                      >
                        {user._count.ownedMarkets}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {user._count.reviews > 0 ? (
                      <Link
                        href={`/admin/reviews?user=${user.id}`}
                        className="text-primary hover:underline"
                      >
                        {user._count.reviews}
                      </Link>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 flex items-center gap-1">
                    <UserResetPasswordButton
                      userId={user.id}
                      userName={user.name}
                      userEmail={user.email}
                    />
                    <UserDeleteButton
                      userId={user.id}
                      userName={user.name}
                      userEmail={user.email}
                      isCurrentUser={user.id === session.user.id}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} totalItems={total} limit={limit} />
    </div>
  );
}

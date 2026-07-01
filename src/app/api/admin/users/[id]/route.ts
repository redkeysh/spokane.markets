import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, apiNotFound, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

const patchUserSchema = z.object({
  role: z.enum(["USER", "VENDOR", "ORGANIZER", "ADMIN"]).optional(),
  accountStatus: z
    .enum(["ACTIVE", "SUSPENDED", "BANNED", "DEACTIVATED"])
    .optional(),
  sendPasswordReset: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireApiAdminPermission("admin.users.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const { role, accountStatus, sendPasswordReset } = parsed.data;

    if (sendPasswordReset) {
      const targetUser = await db.user.findUnique({
        where: { id },
        select: { email: true },
      });
      if (!targetUser) {
        return apiNotFound("User");
      }
      const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/auth/forget-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetUser.email,
          redirectTo: "/auth/reset-password",
        }),
      });
      if (!res.ok) throw new Error("API call failed");
      return NextResponse.json({ success: true, message: "Password reset email sent" });
    }

    if (!role && !accountStatus) {
      return apiError(
        "Role or accountStatus is required unless sendPasswordReset is true",
        400
      );
    }

    const existing = await db.user.findUnique({
      where: { id },
      select: { role: true, accountStatus: true },
    });
    if (!existing) {
      return apiNotFound("User");
    }

    if (role) {
      const rolePermissionCheck = await requireApiAdminPermission("admin.roles.manage");
      if (rolePermissionCheck.error) return rolePermissionCheck.error;
    }

    const nextRole = role ?? existing.role;
    const nextAccountStatus = accountStatus ?? existing.accountStatus;

    const isSelf = id === session.user.id;
    if (isSelf && (nextRole !== "ADMIN" || nextAccountStatus !== "ACTIVE")) {
      return apiError("You cannot demote, suspend, or deactivate your own account", 400);
    }

    const isCurrentlyAdmin = existing.role === "ADMIN";
    const isRemovingAdminPrivilege = isCurrentlyAdmin && nextRole !== "ADMIN";
    const isDisablingAdmin = isCurrentlyAdmin && nextAccountStatus !== "ACTIVE";
    if (isRemovingAdminPrivilege || isDisablingAdmin) {
      const activeAdminCount = await db.user.count({
        where: { role: "ADMIN", accountStatus: "ACTIVE" },
      });
      if (activeAdminCount <= 1) {
        return apiError("At least one active admin account is required", 400);
      }
    }

    const user = await db.user.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(accountStatus ? { accountStatus } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        accountStatus: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await logAudit(session.user.id, "UPDATE_USER", "USER", id, {
      previousValue: {
        role: existing.role,
        accountStatus: existing.accountStatus,
      },
      newValue: {
        role: nextRole,
        accountStatus: nextAccountStatus,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireApiAdminPermission("admin.users.manage");
    if (error) return error;

    const { id } = await params;

    if (id === session.user.id) {
      return apiError("You cannot delete your own account", 400);
    }

    const target = await db.user.findUnique({
      where: { id },
      select: { role: true, accountStatus: true },
    });
    if (!target) {
      return apiNotFound("User");
    }

    if (target.role === "ADMIN" && target.accountStatus === "ACTIVE") {
      const activeAdminCount = await db.user.count({
        where: { role: "ADMIN", accountStatus: "ACTIVE" },
      });
      if (activeAdminCount <= 1) {
        return apiError("At least one active admin account is required", 400);
      }
    }

    await db.user.delete({ where: { id } });
    await logAudit(session.user.id, "DELETE_USER", "USER", id, {
      previousValue: target,
      newValue: null,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}

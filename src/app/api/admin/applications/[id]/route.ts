import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { NextResponse } from "next/server";

const patchApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO", "DUPLICATE"]),
  notes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireApiAdminPermission("admin.moderation.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const { status, notes } = parsed.data;

    const application = await db.$transaction(async (tx) => {
      const before = await tx.application.findUnique({
        where: { id },
        select: { status: true },
      });
      const app = await tx.application.update({
        where: { id },
        data: {
          status,
          notes: notes ?? undefined,
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
        },
        include: {
          form: { select: { type: true } },
        },
      });

      if (status === "APPROVED" && app.userId) {
        const newRole =
          app.form.type === "VENDOR"
            ? "VENDOR"
            : app.form.type === "MARKET"
              ? "ORGANIZER"
              : null;
        if (newRole) {
          // Never downgrade a higher-privileged account by approving a
          // vendor/market application (e.g. don't demote an ADMIN to ORGANIZER).
          await tx.user.updateMany({
            where: { id: app.userId, role: { not: "ADMIN" } },
            data: { role: newRole },
          });
        }
      }

      if (app.form.type === "VENDOR_VERIFICATION" && app.userId) {
        await tx.vendorProfile.updateMany({
          where: { userId: app.userId, deletedAt: null },
          data: {
            verificationStatus: status === "APPROVED" ? "VERIFIED" : "UNVERIFIED",
          },
        });
      }

      return { app, previousStatus: before?.status ?? null };
    });

    if (status === "APPROVED" && application.app.userId) {
      const newRole =
        application.app.form.type === "VENDOR"
          ? "VENDOR"
          : application.app.form.type === "MARKET"
            ? "ORGANIZER"
            : null;
      await logAudit(
        session.user.id,
        "APPROVE_APPLICATION",
        "APPLICATION",
        id,
        {
          email: application.app.email,
          previousValue: { status: application.previousStatus },
          newValue: { status },
          ...(newRole ? { newRole } : {}),
        }
      );
    } else {
      await logAudit(
        session.user.id,
        status === "APPROVED"
          ? "APPROVE_APPLICATION"
          : status === "REJECTED"
            ? "REJECT_APPLICATION"
            : status === "NEEDS_INFO"
              ? "REQUEST_APPLICATION_INFO"
              : "MARK_APPLICATION_DUPLICATE",
        "APPLICATION",
        id,
        {
          email: application.app.email,
          previousValue: { status: application.previousStatus },
          newValue: { status },
        }
      );
    }

    if (application.app.userId) {
      const statusText =
        status === "APPROVED"
          ? "approved"
          : status === "REJECTED"
            ? "rejected"
            : status === "NEEDS_INFO"
              ? "marked as needing more information"
              : "marked as duplicate";
      await createNotification({
        userId: application.app.userId,
        type: "APPLICATION_STATUS",
        title: `Your ${application.app.form.type.toLowerCase()} application has been ${statusText}`,
        link: `/dashboard`,
        objectType: "application",
      });
    }

    return NextResponse.json(application.app);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.moderation.manage");
    if (error) return error;

    const { id } = await params;
    await db.application.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}

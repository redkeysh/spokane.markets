import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { setApplicationStatus } from "@/lib/admin/inbox/moderation";
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
    const application = await setApplicationStatus(id, status, notes, session.user.id);

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

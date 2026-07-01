import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { evaluateAndGrantBadges } from "@/lib/badges";
import { NextResponse } from "next/server";

const patchReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireApiAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = patchReviewSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const review = await db.review.update({
      where: { id },
      data: { status: parsed.data.status },
    });

    if (parsed.data.status === "APPROVED" && review.userId) {
      evaluateAndGrantBadges(review.userId).catch(() => {});
    }
    await logAudit(session.user.id, "UPDATE_REVIEW_STATUS", "REVIEW", id, {
      status: parsed.data.status,
    });

    return NextResponse.json(review);
  } catch (err) {
    return handleApiError(err);
  }
}

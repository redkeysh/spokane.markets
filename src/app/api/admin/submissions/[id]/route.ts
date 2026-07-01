import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { approveSubmissionWithEvent } from "@/lib/submission-approval";
import { NextResponse } from "next/server";

const patchSubmissionSchema = z.object({
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
    const parsed = patchSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.status === "APPROVED") {
      try {
        await approveSubmissionWithEvent(id, session.user.id);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to approve submission";
        return apiError(message, 400);
      }
      const submission = await db.submission.findUnique({ where: { id } });
      return NextResponse.json(submission);
    }

    const before = await db.submission.findUnique({
      where: { id },
      select: { submitterEmail: true, status: true },
    });
    if (!before) {
      return apiError("Submission not found", 404);
    }

    const submission = await db.submission.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewerId: session.user.id,
      },
    });

    const user = await db.user.findUnique({
      where: { email: submission.submitterEmail },
      select: { id: true },
    });
    if (user) {
      await createNotification({
        userId: user.id,
        type: "SUBMISSION_REJECTED",
        title: "Your event submission was rejected",
        link: "/submit",
        objectType: "submission",
      });
    }
    await logAudit(session.user.id, "UPDATE_SUBMISSION_STATUS", "SUBMISSION", id, {
      previousValue: { status: before.status },
      newValue: { status: "REJECTED" },
    });

    return NextResponse.json(submission);
  } catch (err) {
    return handleApiError(err);
  }
}

import { z } from "zod";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import {
  ALREADY_REVIEWED_MESSAGE,
  approveSubmissionWithEvent,
  rejectSubmission,
} from "@/lib/submission-approval";
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
      let event;
      try {
        event = await approveSubmissionWithEvent(id, session.user.id);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Failed to approve submission";
        return apiError(message, 400);
      }
      const submission = await db.submission.findUnique({ where: { id } });
      if (!submission) return apiError("Submission not found", 404);
      if (!event) return apiError(ALREADY_REVIEWED_MESSAGE, 409);
      return NextResponse.json(submission);
    }

    const rejected = await rejectSubmission(id, session.user.id, undefined);
    if (!rejected.ok) {
      return apiError(rejected.error, rejected.reason === "not_found" ? 404 : 409);
    }
    const submission = await db.submission.findUnique({ where: { id } });
    return NextResponse.json(submission);
  } catch (err) {
    return handleApiError(err);
  }
}

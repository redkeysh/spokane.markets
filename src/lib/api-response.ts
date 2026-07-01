import { NextResponse } from "next/server";

interface ApiErrorOptions {
  code?: string;
  details?: unknown;
}

export function apiError(
  message: string,
  status: number,
  options?: ApiErrorOptions
): NextResponse {
  return NextResponse.json(
    {
      error: {
        message,
        ...(options?.code && { code: options.code }),
        ...(options?.details != null ? { details: options.details } : {}),
      },
    },
    { status }
  );
}

export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiValidationError(
  fieldErrors: Record<string, string[]>
): NextResponse {
  return apiError("Validation failed", 400, {
    code: "VALIDATION_ERROR",
    details: { fieldErrors },
  });
}

export function apiNotFound(resource: string = "Resource"): NextResponse {
  return apiError(`${resource} not found`, 404, { code: "NOT_FOUND" });
}

/**
 * Maps a thrown error (especially Prisma known-request errors) to a clean,
 * operator-readable response instead of a raw 500. Use in a catch block:
 *   try { ... } catch (e) { return handleApiError(e); }
 * - P2002 (unique constraint) -> 409 "That <field> is already in use."
 * - P2025 (record not found)  -> 404
 * - P2003 (FK constraint)     -> 400
 * Anything else is logged and returned as a generic 500.
 */
export function handleApiError(error: unknown): NextResponse {
  // Duck-type the Prisma known-request error code. (The Prisma client is
  // generated to a custom path, so a value import of `Prisma` from
  // "@prisma/client" fails to resolve its runtime; only type imports are safe.)
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code === "P2002") {
      const meta = (error as { meta?: { target?: unknown } }).meta;
      const target = Array.isArray(meta?.target)
        ? (meta.target as string[]).join(", ")
        : undefined;
      return apiError(
        target ? `That ${target} is already in use.` : "A record with these values already exists.",
        409,
        { code: "CONFLICT" }
      );
    }
    if (code === "P2025") {
      return apiError("That record no longer exists.", 404, { code: "NOT_FOUND" });
    }
    if (code === "P2003" || code === "P2014") {
      return apiError(
        "This can't be completed because of a related record (it may not exist, or may still be in use).",
        400,
        { code: "FK_CONSTRAINT" }
      );
    }
  }
  console.error("[api] Unhandled error:", error);
  return apiError("Internal server error.", 500);
}

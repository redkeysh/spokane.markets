/**
 * Client-safe helpers for talking to the JSON API.
 *
 * The server returns errors via apiError()/apiValidationError() as
 * `{ error: { message, code?, details? } }`, but a few older routes still return
 * `{ error: "string" }`. Reading `body.error` directly and rendering it (or
 * throwing `new Error(body.error)`) then produces "[object Object]" or crashes
 * React with "Objects are not valid as a React child". getApiErrorMessage
 * normalizes both shapes to a string.
 */
export function getApiErrorMessage(body: unknown, fallback = "Something went wrong"): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
    if (err && typeof err === "object") {
      const message = (err as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

/**
 * True for Next.js control-flow "errors" thrown by redirect()/notFound() inside
 * a server action. These must be re-thrown, not caught and shown as a toast,
 * or navigation silently breaks.
 */
export function isNextControlFlowError(err: unknown): boolean {
  if (err && typeof err === "object" && "digest" in err) {
    const digest = String((err as { digest: unknown }).digest);
    return digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND";
  }
  return false;
}

/** Field-level validation errors, when a route returns apiValidationError. */
export function getApiFieldErrors(body: unknown): Record<string, string[]> | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (err && typeof err === "object") {
      const details = (err as { details?: unknown }).details;
      if (details && typeof details === "object" && "fieldErrors" in details) {
        return (details as { fieldErrors: Record<string, string[]> }).fieldErrors;
      }
    }
  }
  return undefined;
}

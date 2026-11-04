export type SettledFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };

export const REQUEST_FAILED = "That did not go through. Check the connection and try again.";

/**
 * A server action's own result, or a failed result when the request itself throws (offline,
 * signed out, a server error), so the caller shows a message instead of the error page.
 */
export async function settle<T extends { ok: boolean }>(call: Promise<T>): Promise<T | SettledFailure> {
  try {
    return await call;
  } catch {
    return { ok: false, error: REQUEST_FAILED };
  }
}

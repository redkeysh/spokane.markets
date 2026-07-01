export const DEFAULT_ADMIN_LIMIT = 25;

export function parseAdminPagination(params: {
  page?: string;
  limit?: string;
}) {
  const rawPage = parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const rawLimit = parseInt(params.limit ?? String(DEFAULT_ADMIN_LIMIT), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(100, Math.max(1, rawLimit))
    : DEFAULT_ADMIN_LIMIT;
  return { page, limit };
}

/**
 * Returns `value` only when it is a member of `allowed`; otherwise `undefined`.
 * Use for enum-backed query params (e.g. ?status=) so an unknown value becomes
 * "no filter" instead of being cast straight into a Prisma where clause, which
 * throws and crashes the whole list/export page.
 */
export function parseEnumParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[]
): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function parseFlag(value?: string) {
  return value === "1" || value === "true";
}

export function parseQuery(value?: string) {
  return (value ?? "").trim();
}


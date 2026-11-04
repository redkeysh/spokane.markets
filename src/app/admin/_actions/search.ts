"use server";

import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { MAX_QUERY_LENGTH, normalizeQuery, searchAdmin, type JumpResults } from "@/lib/admin/search";

/** Input is trimmed to MAX_QUERY_LENGTH; anything four times longer is refused. */
const queryInput = z
  .string()
  .max(MAX_QUERY_LENGTH * 4)
  .transform(normalizeQuery);

/** Jump's entity search. Reads only; nothing to revalidate. */
export async function searchAdminAction(q: unknown): Promise<JumpResults> {
  await requireAdminAction();
  const parsed = queryInput.safeParse(q);
  if (!parsed.success) return { query: "", weekend: null, groups: [] };
  return searchAdmin(parsed.data);
}

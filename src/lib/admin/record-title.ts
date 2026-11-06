import type { Metadata } from "next";
import { getSession } from "@/lib/auth-utils";

type Viewer = { role?: string | null; accountStatus?: string | null } | null | undefined;

/** Whether the viewer may read admin records: an admin whose account is active. */
export function isActiveAdmin(user: Viewer): boolean {
  return user?.role === "ADMIN" && user.accountStatus === "ACTIVE";
}

/**
 * The browser title of an admin record page. Metadata resolves apart from the admin layout's
 * sign-in check, so the record is read only for an active admin. Anyone else, and a record that
 * does not exist, gets `generic`: the title shows neither the record nor whether its id exists.
 */
export async function adminRecordTitle(generic: string, load: () => Promise<string | null | undefined>): Promise<Metadata> {
  const session = await getSession();
  if (!isActiveAdmin(session?.user)) return { title: generic };
  const title = (await load())?.trim();
  return { title: title || generic };
}

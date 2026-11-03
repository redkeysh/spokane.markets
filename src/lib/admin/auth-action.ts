import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AdminSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * The signed-in admin for a server action: an ACTIVE account with the ADMIN
 * role. Throws "Unauthorized" otherwise. ADMIN holds every admin permission.
 */
export async function requireAdminAction(): Promise<AdminSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "ADMIN" || session.user.accountStatus !== "ACTIVE") {
    throw new Error("Unauthorized");
  }
  return session;
}

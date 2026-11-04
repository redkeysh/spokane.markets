import { db } from "@/lib/db";
import { topCategories } from "./admin-list";

/** The primary categories active vendors use, offered as choices on the vendor page. */
export async function vendorCategories(): Promise<string[]> {
  const rows = await db.vendorProfile.findMany({
    where: { deletedAt: null, NOT: { primaryCategory: null } },
    select: { primaryCategory: true },
  });
  return topCategories(rows.map((r) => r.primaryCategory));
}

import type { AccountStatus, Role } from "@prisma/client";

/** Roles in the owner's words. */
export const ROLE_WORDS: Record<Role, { one: string; plural: string; help: string }> = {
  USER: { one: "User", plural: "Users", help: "Can save events, write reviews and add photos." },
  VENDOR: { one: "Vendor", plural: "Vendors", help: "Can also run a vendor profile and apply to markets." },
  ORGANIZER: { one: "Organizer", plural: "Organizers", help: "Can also run the markets and events they organize." },
  ADMIN: { one: "Admin", plural: "Admins", help: "Can do everything here, in the admin." },
};

export const STATUS_WORDS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  BANNED: "Banned",
  DEACTIVATED: "Deactivated",
};

export const ROLE_ORDER: readonly Role[] = ["USER", "VENDOR", "ORGANIZER", "ADMIN"];

export const STATUS_ORDER: readonly AccountStatus[] = ["ACTIVE", "SUSPENDED", "BANNED", "DEACTIVATED"];

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "2 markets, 1 review", leaving out whatever is zero; null when both are. */
export function userCounts(markets: number, reviews: number): string | null {
  const parts = [markets > 0 ? plural(markets, "market", "markets") : null, reviews > 0 ? plural(reviews, "review", "reviews") : null];
  const text = parts.filter(Boolean).join(", ");
  return text || null;
}

export type AuditEntry = {
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  user: { name: string | null; email: string } | null;
};

/**
 * Status changes are logged as { newValue: { status } } by the server actions,
 * but the review PATCH route logs a top-level { status }. Read both so an
 * approval is never mislabeled as a rejection.
 */
function statusOf(e: AuditEntry): string | undefined {
  const m = e.metadata as
    | { status?: string; newValue?: { status?: string } }
    | null
    | undefined;
  return m?.newValue?.status ?? m?.status;
}

const ACTION_MESSAGES: Record<string, (entry: AuditEntry) => string> = {
  DELETE_EVENT: () => "deleted an event",
  SOFT_DELETE_EVENT: () => "archived an event",
  RESTORE_EVENT: () => "restored an event",
  DELETE_VENUE: () => "deleted a venue",
  SOFT_DELETE_VENUE: () => "archived a venue",
  MERGE_VENUES: () => "merged duplicate venues",
  UPDATE_VENUE: () => "updated a venue",
  UPDATE_EVENT: () => "updated an event",
  CREATE_API_TOKEN: () => "created an API token",
  REVOKE_API_TOKEN: () => "revoked an API token",
  RESTORE_VENUE: () => "restored a venue",
  DELETE_MARKET: () => "deleted a market",
  SOFT_DELETE_MARKET: () => "archived a market",
  RESTORE_MARKET: () => "restored a market",
  SOFT_DELETE_VENDOR: () => "archived a vendor",
  RESTORE_VENDOR: () => "restored a vendor",
  UPDATE_SUBMISSION_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved a submission" : "rejected a submission",
  BULK_UPDATE_SUBMISSION_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved submissions" : "rejected submissions",
  UPDATE_REVIEW_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved a review" : "rejected a review",
  BULK_UPDATE_REVIEW_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved reviews" : "rejected reviews",
  UPDATE_PHOTO_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved a photo" : "rejected a photo",
  BULK_UPDATE_PHOTO_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved photos" : "rejected photos",
  UPDATE_CLAIM_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved a market claim" : "rejected a market claim",
  UPDATE_VENDOR_CLAIM_STATUS: (e) =>
    statusOf(e) === "APPROVED" ? "approved a vendor claim" : "rejected a vendor claim",
  UPDATE_REPORT_STATUS: (e) =>
    statusOf(e) === "DISMISSED" ? "dismissed a report" : "resolved a report",
  ASSIGN_REPORT: () => "assigned a report",
  UNASSIGN_REPORT: () => "unassigned a report",
  UPDATE_REPORT_INTERNAL_NOTES: () => "updated report internal notes",
  UPDATE_USER_ROLE: (e) => {
    const role = (e.metadata as { newRole?: string })?.newRole;
    return role ? `changed user role to ${role}` : "updated user role";
  },
  UPDATE_USER: () => "updated a user",
  DELETE_USER: () => "deleted a user",
  UPDATE_MAINTENANCE_MODE: () => "updated maintenance mode",
};

const TARGET_HREFS: Record<string, string> = {
  EVENT: "/admin/events",
  VENUE: "/admin/venues",
  MARKET: "/admin/markets",
  VENDOR_PROFILE: "/admin/vendors",
  USER: "/admin/users",
  SUBMISSION: "/admin/submissions",
  REVIEW: "/admin/reviews",
  PHOTO: "/admin/photos",
  CLAIM: "/admin/queues",
  VENDOR_CLAIM: "/admin/queues",
  REPORT: "/admin/reports",
  SITE_STATE: "/admin/settings",
  API_TOKEN: "/admin/api-tokens",
};

export function formatAuditEntry(
  entry: AuditEntry
): { message: string; href: string | null } {
  const formatter = ACTION_MESSAGES[entry.action];
  const verb = formatter ? formatter(entry) : entry.action.replace(/_/g, " ").toLowerCase();
  const actor = entry.user?.name ?? entry.user?.email ?? "Admin";
  const message = `${actor} ${verb}`;
  const href = entry.targetType ? TARGET_HREFS[entry.targetType] ?? null : null;
  return { message, href };
}

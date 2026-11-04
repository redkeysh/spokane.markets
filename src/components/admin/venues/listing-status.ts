import { STATUS_MARKS, type MarkStatus } from "@/components/admin/kit/status-mark";

const MARKET_STATUS: Record<string, MarkStatus> = { VERIFIED: "VERIFIED", PENDING: "VERIFICATION_PENDING", UNVERIFIED: "NOT_VERIFIED" };

/** The status mark of a market's verification status. */
export function marketMark(verification: string): MarkStatus {
  return MARKET_STATUS[verification] ?? "NOT_VERIFIED";
}

/** The status mark of an event status; an unknown one shows as Pending. */
export function eventMark(status: string): MarkStatus {
  return status in STATUS_MARKS ? (status as MarkStatus) : "PENDING";
}

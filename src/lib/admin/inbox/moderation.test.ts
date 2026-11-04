import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
  badges: vi.fn(async () => {}),
  notify: vi.fn(),
  reviewFind: vi.fn(),
  reviewUpdateMany: vi.fn(),
  photoFind: vi.fn(),
  photoUpdateMany: vi.fn(),
  reportFind: vi.fn(),
  reportUpdateMany: vi.fn(),
  reportUpdate: vi.fn(),
  messageFind: vi.fn(),
  messageUpdateMany: vi.fn(),
  appFind: vi.fn(),
  appUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  userFind: vi.fn(),
  vendorUpdateMany: vi.fn(),
  vendorFindFirst: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/badges", () => ({ evaluateAndGrantBadges: mocks.badges }));
vi.mock("@/lib/notifications", () => ({ createNotification: mocks.notify }));
vi.mock("@/lib/db", () => {
  const client = {
    review: { findUnique: mocks.reviewFind, updateMany: mocks.reviewUpdateMany },
    photo: { findUnique: mocks.photoFind, updateMany: mocks.photoUpdateMany },
    report: { findUnique: mocks.reportFind, updateMany: mocks.reportUpdateMany, update: mocks.reportUpdate },
    contactMessage: { findUnique: mocks.messageFind, updateMany: mocks.messageUpdateMany },
    application: { findUnique: mocks.appFind, update: mocks.appUpdate },
    user: { updateMany: mocks.userUpdateMany, findUnique: mocks.userFind },
    vendorProfile: { updateMany: mocks.vendorUpdateMany, findFirst: mocks.vendorFindFirst },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});

import { setApplicationNotes, setApplicationStatus, setMessageStatus, setReportAssignee, setReportStatus, setReviewStatus } from "./moderation";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.badges.mockResolvedValue(undefined);
});

describe("setReviewStatus", () => {
  it("writes the old action's audit entry when no decision is given", async () => {
    mocks.reviewFind.mockResolvedValue({ userId: "u1", status: "PENDING" });
    mocks.reviewUpdateMany.mockResolvedValue({ count: 1 });
    const result = await setReviewStatus("r1", "APPROVED", "admin");
    expect(result).toEqual({ found: true, changed: true, previous: "PENDING" });
    expect(mocks.reviewUpdateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "PENDING" }, data: { status: "APPROVED" } });
    expect(mocks.badges).toHaveBeenCalledWith("u1");
    expect(mocks.logAudit).toHaveBeenCalledWith("admin", "UPDATE_REVIEW_STATUS", "REVIEW", "r1", {
      previousValue: { status: "PENDING" },
      newValue: { status: "APPROVED" },
    });
  });

  it("carries the decision id and title, and skips a review that already has the status", async () => {
    mocks.reviewFind.mockResolvedValueOnce({ userId: null, status: "PENDING" }).mockResolvedValueOnce({ userId: null, status: "REJECTED" });
    mocks.reviewUpdateMany.mockResolvedValue({ count: 1 });
    await setReviewStatus("r1", "REJECTED", "admin", { ref: { decisionId: "d1", decisionKey: "review:r1", title: "the review of X" }, skipSame: true });
    const meta = mocks.logAudit.mock.calls[0][4];
    expect(meta.details).toMatchObject({ decisionId: "d1", decisionKey: "review:r1", title: "the review of X" });
    expect(typeof meta.details.at).toBe("string");

    const again = await setReviewStatus("r1", "REJECTED", "admin", { skipSame: true });
    expect(again).toEqual({ found: true, changed: false, previous: "REJECTED" });
    expect(mocks.reviewUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the review changed while it ran, or is gone", async () => {
    mocks.reviewFind.mockResolvedValueOnce({ userId: null, status: "PENDING" }).mockResolvedValueOnce(null);
    mocks.reviewUpdateMany.mockResolvedValue({ count: 0 });
    expect(await setReviewStatus("r1", "APPROVED", "admin")).toMatchObject({ changed: false });
    expect(await setReviewStatus("r2", "APPROVED", "admin")).toEqual({ found: false, changed: false, previous: null });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe("setReportStatus", () => {
  it("closes the escalation when resolving and records what it was", async () => {
    mocks.reportFind.mockResolvedValue({ status: "PENDING", escalationStatus: "ESCALATED" });
    mocks.reportUpdateMany.mockResolvedValue({ count: 1 });
    await setReportStatus("x1", "RESOLVED", "admin");
    expect(mocks.reportUpdateMany).toHaveBeenCalledWith({
      where: { id: "x1", status: "PENDING" },
      data: { status: "RESOLVED", escalationStatus: "CLOSED" },
    });
    expect(mocks.logAudit.mock.calls[0][4]).toEqual({
      previousValue: { status: "PENDING", escalationStatus: "ESCALATED" },
      newValue: { status: "RESOLVED", escalationStatus: "CLOSED" },
    });
  });

  it("leaves the escalation alone when dismissing", async () => {
    mocks.reportFind.mockResolvedValue({ status: "PENDING", escalationStatus: "NEW" });
    mocks.reportUpdateMany.mockResolvedValue({ count: 1 });
    await setReportStatus("x1", "DISMISSED", "admin");
    expect(mocks.reportUpdateMany.mock.calls[0][0].data).toEqual({ status: "DISMISSED" });
  });
});

describe("setReportAssignee", () => {
  it("assigns, and does nothing when unassigning a report nobody has", async () => {
    mocks.reportFind.mockResolvedValueOnce({ assigneeUserId: null }).mockResolvedValueOnce({ assigneeUserId: null });
    expect(await setReportAssignee("x1", "admin", "admin")).toBe(true);
    expect(mocks.logAudit.mock.calls[0][1]).toBe("ASSIGN_REPORT");
    expect(await setReportAssignee("x1", null, "admin")).toBe(false);
    expect(mocks.reportUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("setMessageStatus", () => {
  it("sets when it was read, and clears it when marked unread", async () => {
    mocks.messageFind.mockResolvedValueOnce({ status: "PENDING", readAt: null }).mockResolvedValueOnce({ status: "READ", readAt: new Date("2026-11-01T00:00:00Z") });
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    await setMessageStatus("m1", "READ", "admin");
    expect(mocks.messageUpdateMany.mock.calls[0][0].data.readAt).toBeInstanceOf(Date);
    await setMessageStatus("m1", "PENDING", "admin");
    expect(mocks.messageUpdateMany.mock.calls[1][0].data).toEqual({ status: "PENDING", readAt: null });
    expect(mocks.logAudit.mock.calls[1][4]).toMatchObject({
      previousValue: { status: "READ", readAt: "2026-11-01T00:00:00.000Z" },
      newValue: { status: "PENDING", readAt: null },
    });
  });
});

describe("setApplicationStatus", () => {
  const app = (type: string, userId: string | null) => ({ id: "a1", userId, email: "dana@x.com", name: "Dana Lee", form: { type } });

  it("gives an approved market applicant the organizer role and tells them", async () => {
    mocks.appFind.mockResolvedValue({ status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null });
    mocks.appUpdate.mockResolvedValue(app("MARKET", "u1"));
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    const result = await setApplicationStatus("a1", "APPROVED", undefined, "admin");
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({ where: { id: "u1", role: { not: "ADMIN" } }, data: { role: "ORGANIZER" } });
    expect(result).toMatchObject({ previousStatus: "PENDING", roleGiven: "ORGANIZER", told: "Dana Lee" });
    expect(mocks.logAudit).toHaveBeenCalledWith("admin", "APPROVE_APPLICATION", "APPLICATION", "a1", {
      email: "dana@x.com",
      previousValue: { status: "PENDING" },
      newValue: { status: "APPROVED" },
      newRole: "ORGANIZER",
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "Your market application has been approved" }));
  });

  it("records what undo needs when it is part of a decision", async () => {
    const reviewedAt = new Date("2026-10-01T00:00:00Z");
    mocks.appFind.mockResolvedValue({ status: "PENDING", notes: "old", reviewedAt, reviewedBy: "a0" });
    mocks.appUpdate.mockResolvedValue(app("VENDOR", null));
    await setApplicationStatus("a1", "NEEDS_INFO", undefined, "admin", { decisionId: "d1", title: "the application from Dana" });
    const [, action, , , meta] = mocks.logAudit.mock.calls[0];
    expect(action).toBe("REQUEST_APPLICATION_INFO");
    expect(meta.previousValue).toEqual({ status: "PENDING", notes: "old", reviewedAt: reviewedAt.toISOString(), reviewedBy: "a0" });
    expect(meta.details).toMatchObject({ decisionId: "d1", title: "the application from Dana" });
    expect(meta.newRole).toBeUndefined();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("sets a vendor verification's profile and records the verification before and after", async () => {
    mocks.appFind.mockResolvedValue({ status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null });
    mocks.appUpdate.mockResolvedValue(app("VENDOR_VERIFICATION", "u2"));
    mocks.vendorFindFirst.mockResolvedValue({ verificationStatus: "PENDING" });
    const result = await setApplicationStatus("a1", "REJECTED", undefined, "admin", { decisionId: "d2" });
    expect(mocks.vendorUpdateMany).toHaveBeenCalledWith({ where: { userId: "u2", deletedAt: null }, data: { verificationStatus: "UNVERIFIED" } });
    expect(result.vendorVerification).toBe("UNVERIFIED");
    const meta = mocks.logAudit.mock.calls[0][4];
    expect(meta.vendorVerification).toBe("UNVERIFIED");
    expect(meta.previousValue).toMatchObject({ status: "PENDING", vendorVerification: "PENDING" });
    expect(meta.newValue).toEqual({ status: "REJECTED", vendorVerification: "UNVERIFIED" });
  });

  it("records the role an approval gave when it is part of a decision", async () => {
    mocks.appFind.mockResolvedValue({ status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null });
    mocks.appUpdate.mockResolvedValue(app("VENDOR", "u1"));
    mocks.userFind.mockResolvedValue({ role: "USER" });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    await setApplicationStatus("a1", "APPROVED", undefined, "admin", { decisionId: "d3" });
    const meta = mocks.logAudit.mock.calls[0][4];
    expect(meta.previousValue).toMatchObject({ status: "PENDING", role: "USER" });
    expect(meta.newValue).toEqual({ status: "APPROVED", role: "VENDOR" });
    expect(meta.details).toMatchObject({ decisionId: "d3", notified: ["Dana Lee"] });
  });

  it("records no role change when the account is an admin", async () => {
    mocks.appFind.mockResolvedValue({ status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null });
    mocks.appUpdate.mockResolvedValue(app("MARKET", "u1"));
    mocks.userFind.mockResolvedValue({ role: "ADMIN" });
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });
    const result = await setApplicationStatus("a1", "APPROVED", undefined, "admin", { decisionId: "d4" });
    expect(result.roleGiven).toBeNull();
    const meta = mocks.logAudit.mock.calls[0][4];
    expect(meta.previousValue.role).toBeUndefined();
    expect(meta.newValue).toEqual({ status: "APPROVED" });
  });
});

describe("setApplicationNotes", () => {
  it("saves the notes alone and audits them", async () => {
    mocks.appFind.mockResolvedValue({ notes: "old" });
    expect(await setApplicationNotes("a1", "", "admin")).toBe(true);
    expect(mocks.appUpdate).toHaveBeenCalledWith({ where: { id: "a1" }, data: { notes: null } });
    expect(mocks.logAudit).toHaveBeenCalledWith("admin", "UPDATE_APPLICATION_NOTES", "APPLICATION", "a1", {
      previousValue: { notes: "old" },
      newValue: { notes: null },
    });
    mocks.appFind.mockResolvedValue(null);
    expect(await setApplicationNotes("a2", "x", "admin")).toBe(false);
  });
});

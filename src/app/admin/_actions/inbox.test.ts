import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class EventMutationError extends Error {}
  return {
    EventMutationError,
    requireAdminAction: vi.fn(),
    revalidateAdmin: vi.fn(),
    undoDecision: vi.fn(),
    setReviewStatus: vi.fn(),
    setPhotoStatus: vi.fn(),
    setReportStatus: vi.fn(),
    setReportTriage: vi.fn(),
    setReportNotes: vi.fn(),
    setReportAssignee: vi.fn(),
    setMessageStatus: vi.fn(),
    setApplicationStatus: vi.fn(),
    setApplicationNotes: vi.fn(),
    rejectSubmission: vi.fn(),
    setMarketVerification: vi.fn(),
    updateEventFields: vi.fn(),
    loadPublicItem: vi.fn(),
    reviewFindMany: vi.fn(),
    photoFindMany: vi.fn(),
    photoFindUnique: vi.fn(),
    messageFindMany: vi.fn(),
    applicationFindUnique: vi.fn(),
    submissionFindMany: vi.fn(),
    userFindMany: vi.fn(),
  };
});

vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/admin/undo", () => ({ newDecisionId: () => "d_test", undoDecision: mocks.undoDecision }));
vi.mock("@/lib/admin/inbox/moderation", () => ({
  setReviewStatus: mocks.setReviewStatus,
  setPhotoStatus: mocks.setPhotoStatus,
  setReportStatus: mocks.setReportStatus,
  setReportTriage: mocks.setReportTriage,
  setReportNotes: mocks.setReportNotes,
  setReportAssignee: mocks.setReportAssignee,
  setMessageStatus: mocks.setMessageStatus,
  setApplicationStatus: mocks.setApplicationStatus,
  setApplicationNotes: mocks.setApplicationNotes,
}));
vi.mock("@/lib/admin/inbox/load", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/inbox/load")>("@/lib/admin/inbox/load");
  return { parsePublicKey: actual.parsePublicKey, loadPublicItem: mocks.loadPublicItem };
});
vi.mock("@/lib/submission-approval", () => ({ rejectSubmission: mocks.rejectSubmission }));
vi.mock("@/lib/events/mutations", () => ({ EventMutationError: mocks.EventMutationError, updateEventFields: mocks.updateEventFields }));
vi.mock("./markets", () => ({ setMarketVerification: mocks.setMarketVerification }));
vi.mock("@/lib/db", () => ({
  db: {
    review: { findMany: mocks.reviewFindMany },
    photo: { findMany: mocks.photoFindMany, findUnique: mocks.photoFindUnique },
    contactMessage: { findMany: mocks.messageFindMany },
    application: { findUnique: mocks.applicationFindUnique },
    submission: { findMany: mocks.submissionFindMany },
    user: { findMany: mocks.userFindMany },
  },
}));

import {
  assignReport,
  decidePublicItems,
  getPublicDecisionData,
  makePhotoEventPicture,
  saveApplicationNotes,
  saveReportTriage,
  undoPublicDecision,
} from "./inbox";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin1" } });
  mocks.reviewFindMany.mockResolvedValue([]);
  mocks.photoFindMany.mockResolvedValue([]);
  mocks.messageFindMany.mockResolvedValue([]);
});

describe("decidePublicItems: statuses", () => {
  it("approves reviews as one decision and reports what was already approved or gone", async () => {
    mocks.reviewFindMany.mockResolvedValue([{ id: "r1", event: { title: "Kendall Yards " }, market: null }]);
    mocks.setReviewStatus
      .mockResolvedValueOnce({ found: true, changed: true, previous: "PENDING" })
      .mockResolvedValueOnce({ found: true, changed: false, previous: "APPROVED" })
      .mockResolvedValueOnce({ found: false, changed: false, previous: null });
    const result = await decidePublicItems({ kind: "review", ids: ["r1", "r2", "r3", "r1"], to: "APPROVED", decisionKey: "review:r1" });
    expect(result).toEqual({
      ok: true,
      message: "Approved 1 review. 1 was already approved. 1 is gone.",
      decisionId: "d_test",
      undoable: true,
      changed: ["r1"],
    });
    expect(mocks.setReviewStatus).toHaveBeenCalledTimes(3);
    expect(mocks.setReviewStatus).toHaveBeenCalledWith("r1", "APPROVED", "admin1", {
      ref: { decisionId: "d_test", decisionKey: "review:r1", title: "the review of Kendall Yards" },
      skipSame: true,
    });
    expect(mocks.revalidateAdmin).toHaveBeenCalledTimes(1);
  });

  it("offers no undo and leaves the pages alone when nothing changed", async () => {
    mocks.setMessageStatus.mockResolvedValue({ found: true, changed: false, previous: "READ" });
    const result = await decidePublicItems({ kind: "message", ids: ["m1"], to: "READ" });
    expect(result).toMatchObject({ ok: true, decisionId: null, undoable: false, changed: [], message: "Nothing changed. 1 was already read." });
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });

  it("refuses statuses a kind does not have, and signed-out callers", async () => {
    expect(await decidePublicItems({ kind: "report", ids: ["x1"], to: "APPROVED" } as never)).toMatchObject({ ok: false });
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    expect(await decidePublicItems({ kind: "review", ids: ["r1"], to: "APPROVED" })).toEqual({ ok: false, error: "Sign in as an admin to do this." });
    expect(mocks.setReviewStatus).not.toHaveBeenCalled();
  });
});

describe("decidePublicItems: applications", () => {
  it("approves with the decision id, says what changed for the account and can be undone", async () => {
    mocks.applicationFindUnique.mockResolvedValue({ status: "PENDING", name: "Dana Lee", userId: "u1", form: { type: "VENDOR" } });
    mocks.setApplicationStatus.mockResolvedValue({ app: { form: { type: "VENDOR" } }, roleGiven: "VENDOR", vendorVerification: null, told: "Dana Lee" });
    const result = await decidePublicItems({ kind: "application", ids: ["a1"], to: "APPROVED" });
    expect(mocks.setApplicationStatus).toHaveBeenCalledWith("a1", "APPROVED", undefined, "admin1", {
      decisionId: "d_test",
      decisionKey: undefined,
      title: "the application from Dana Lee",
    });
    expect(result).toMatchObject({
      ok: true,
      undoable: true,
      decisionId: "d_test",
      message: "Approved Dana Lee's application. Their account is now a vendor account. Dana was told.",
    });
  });

  it("can undo a rejection", async () => {
    mocks.applicationFindUnique.mockResolvedValue({ status: "PENDING", name: "Dana", userId: null, form: { type: "MARKET" } });
    mocks.setApplicationStatus.mockResolvedValue({ app: { form: { type: "MARKET" } }, roleGiven: null, vendorVerification: null, told: null });
    expect(await decidePublicItems({ kind: "application", ids: ["a1"], to: "REJECTED" })).toMatchObject({ undoable: true, decisionId: "d_test" });
  });

  it("passes the notes written with a decision", async () => {
    mocks.applicationFindUnique.mockResolvedValue({ status: "PENDING", name: "Dana" });
    mocks.setApplicationStatus.mockResolvedValue({ app: { form: { type: "VENDOR" } }, roleGiven: null, vendorVerification: null, told: null });
    await decidePublicItems({ kind: "application", ids: ["a1"], to: "NEEDS_INFO", notes: "  Asked for photos " });
    expect(mocks.setApplicationStatus).toHaveBeenCalledWith("a1", "NEEDS_INFO", "Asked for photos", "admin1", expect.objectContaining({ decisionId: "d_test" }));
  });

  it("saves notes on their own", async () => {
    mocks.setApplicationNotes.mockResolvedValue(true);
    expect(await saveApplicationNotes({ applicationId: "a1", notes: " Called them " })).toMatchObject({ ok: true, message: "Saved the notes." });
    expect(mocks.setApplicationNotes).toHaveBeenCalledWith("a1", "Called them", "admin1");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
    mocks.setApplicationNotes.mockResolvedValue(false);
    expect(await saveApplicationNotes({ applicationId: "a1", notes: "" })).toMatchObject({ ok: false, error: "This application is gone." });
  });

  it("does nothing for the status it already has", async () => {
    mocks.applicationFindUnique.mockResolvedValue({ status: "REJECTED", name: "Dana", userId: null, form: { type: "MARKET" } });
    expect(await decidePublicItems({ kind: "application", ids: ["a1"], to: "REJECTED" })).toMatchObject({ ok: true, changed: [] });
    expect(mocks.setApplicationStatus).not.toHaveBeenCalled();
  });
});

describe("decidePublicItems: submissions and markets", () => {
  it("rejects submissions with one reason and tells the senders with an account", async () => {
    mocks.submissionFindMany.mockResolvedValue([
      { id: "s1", eventTitle: "Fall Fair ", submitterName: "Dana", submitterEmail: "dana@x.com" },
      { id: "s2", eventTitle: "Expo", submitterName: "Lee", submitterEmail: "lee@x.com" },
    ]);
    mocks.userFindMany.mockResolvedValue([{ email: "dana@x.com" }]);
    mocks.rejectSubmission.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "already" });
    const result = await decidePublicItems({ kind: "submission", ids: ["s1", "s2"], to: "REJECTED", reason: "Not a market or fair" });
    expect(mocks.rejectSubmission.mock.calls[0][0]).toBe("s1");
    expect(mocks.rejectSubmission.mock.calls[0][2]).toBe("Not a market or fair");
    expect(mocks.rejectSubmission.mock.calls[0][3].auditMeta.details).toMatchObject({
      decisionId: "d_test",
      title: "Fall Fair",
      reason: "Not a market or fair",
      notified: ["Dana"],
    });
    expect(result).toMatchObject({ ok: true, changed: ["s1"], message: "Rejected Fall Fair: Not a market or fair. 1 was already decided. Dana was told." });
  });

  it("needs a reason to reject a submission", async () => {
    expect(await decidePublicItems({ kind: "submission", ids: ["s1"], to: "REJECTED", reason: " " })).toEqual({ ok: false, error: "Choose a reason." });
  });

  it("verifies a market through the markets action, with the decision id", async () => {
    mocks.setMarketVerification.mockResolvedValue({ ok: true, message: "Garland Market is now verified. 1 person was told.", decisionId: "d_test" });
    const result = await decidePublicItems({ kind: "market", ids: ["k1"], to: "VERIFIED", decisionKey: "market-verification:k1" });
    expect(mocks.setMarketVerification).toHaveBeenCalledWith({
      marketId: "k1",
      status: "VERIFIED",
      decision: { decisionId: "d_test", decisionKey: "market-verification:k1" },
    });
    expect(result).toMatchObject({ ok: true, undoable: true, changed: ["k1"] });
  });

  it("offers no undo when the market already had the status", async () => {
    mocks.setMarketVerification.mockResolvedValue({ ok: true, message: "Garland Market is already verified." });
    expect(await decidePublicItems({ kind: "market", ids: ["k1"], to: "VERIFIED" })).toMatchObject({ undoable: false, decisionId: null });
  });
});

describe("makePhotoEventPicture", () => {
  it("sets the event picture and shows the photo in one decision", async () => {
    mocks.photoFindUnique.mockResolvedValue({ id: "p1", url: "/uploads/p1.webp", status: "PENDING", event: { id: "e1", title: "Fall Fair", imageUrl: null, deletedAt: null } });
    mocks.setPhotoStatus.mockResolvedValue({ found: true, changed: true, previous: "PENDING" });
    const result = await makePhotoEventPicture({ photoId: "p1" });
    expect(mocks.updateEventFields).toHaveBeenCalledWith("e1", { imageUrl: "/uploads/p1.webp" }, "admin1", { decisionId: "d_test", decisionKey: undefined });
    expect(mocks.setPhotoStatus).toHaveBeenCalledWith("p1", "APPROVED", "admin1", expect.objectContaining({ skipSame: true }));
    expect(result).toMatchObject({ ok: true, undoable: true, changed: ["e1", "p1"] });
  });

  it("refuses a photo with no listed event", async () => {
    mocks.photoFindUnique.mockResolvedValue({ id: "p1", url: "/u.webp", status: "PENDING", event: null });
    expect(await makePhotoEventPicture({ photoId: "p1" })).toMatchObject({ ok: false });
    expect(mocks.updateEventFields).not.toHaveBeenCalled();
  });
});

describe("report triage", () => {
  it("saves severity and notes, and assigns to the signed-in admin", async () => {
    mocks.setReportTriage.mockResolvedValue(true);
    mocks.setReportNotes.mockResolvedValue(true);
    expect(await saveReportTriage({ reportId: "x1", severity: "HIGH", internalNotes: "Called them" })).toMatchObject({ ok: true });
    expect(mocks.setReportTriage).toHaveBeenCalledWith("x1", { severity: "HIGH" }, "admin1");
    expect(mocks.setReportNotes).toHaveBeenCalledWith("x1", "Called them", "admin1");
    mocks.setReportAssignee.mockResolvedValue(true);
    expect(await assignReport({ reportId: "x1", assign: true })).toMatchObject({ ok: true, message: "Assigned to you." });
    expect(mocks.setReportAssignee).toHaveBeenCalledWith("x1", "admin1", "admin1");
  });
});

describe("getPublicDecisionData and undo", () => {
  it("reads the item a decision key names, and nothing for other keys", async () => {
    mocks.loadPublicItem.mockResolvedValue({ kind: "market", id: "k1" });
    expect(await getPublicDecisionData("market-verification:k1")).toEqual({ kind: "market", id: "k1" });
    expect(mocks.loadPublicItem).toHaveBeenCalledWith("market", "k1");
    expect(await getPublicDecisionData("ready:2026-11-07")).toBeNull();
  });

  it("undoes through the shared undo and refreshes the admin", async () => {
    mocks.undoDecision.mockResolvedValue({ ok: true, message: "Restored the review of X." });
    expect(await undoPublicDecision("d1")).toEqual({ ok: true, message: "Restored the review of X." });
    expect(mocks.undoDecision).toHaveBeenCalledWith("d1", "admin1");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });
});

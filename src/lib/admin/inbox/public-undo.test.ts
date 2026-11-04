import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reviewFindMany: vi.fn(),
  photoFindMany: vi.fn(),
  reportFindMany: vi.fn(),
  applicationFindMany: vi.fn(),
  messageFindMany: vi.fn(),
  reviewUpdateMany: vi.fn(),
  auditFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const client = {
    review: { findMany: mocks.reviewFindMany, updateMany: mocks.reviewUpdateMany },
    photo: { findMany: mocks.photoFindMany },
    report: { findMany: mocks.reportFindMany },
    application: { findMany: mocks.applicationFindMany },
    contactMessage: { findMany: mocks.messageFindMany },
    auditLog: { findMany: mocks.auditFindMany, create: mocks.auditCreate },
    $transaction: (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { db: client };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events/slug", () => ({ eventSlugProblem: vi.fn(), lockEventForSlugChange: vi.fn(), recordEventSlugChange: vi.fn() }));

import { isUndoable, undoBlockers, undoDecision, type AuditRow } from "../undo";
import { loadPublicRows, publicEntryUndoable, restorePublicTarget, statusAfter, verificationOnly } from "./public-undo";

const entry = (targetType: string, targetId: string, action: string, metadata: Record<string, unknown>): AuditRow => ({
  id: `${targetType}-${targetId}`,
  action,
  targetType,
  targetId,
  createdAt: new Date("2026-11-03T17:00:00Z"),
  metadata: { details: { decisionId: "d1" }, ...metadata } as AuditRow["metadata"],
});

beforeEach(() => vi.resetAllMocks());

describe("which public decisions undo can reverse", () => {
  it("takes back status changes of reviews, photos, reports and messages", () => {
    expect(isUndoable(entry("REVIEW", "r1", "UPDATE_REVIEW_STATUS", { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED" } }))).toBe(true);
    expect(isUndoable(entry("CONTACT_MESSAGE", "m1", "UPDATE_CONTACT_MESSAGE_STATUS", { previousValue: { status: "PENDING" } }))).toBe(true);
    expect(isUndoable(entry("REPORT", "x1", "UPDATE_REPORT_TRIAGE", { previousValue: { severity: "LOW" } }))).toBe(false);
  });

  it("takes back application decisions, including those that changed the account", () => {
    const plain = entry("APPLICATION", "a1", "REJECT_APPLICATION", { previousValue: { status: "PENDING" }, newValue: { status: "REJECTED" } });
    expect(publicEntryUndoable(plain)).toBe(true);
    const approved = entry("APPLICATION", "a1", "APPROVE_APPLICATION", {
      previousValue: { status: "PENDING", role: "USER" },
      newValue: { status: "APPROVED", role: "VENDOR" },
      newRole: "VENDOR",
    });
    expect(publicEntryUndoable(approved)).toBe(true);
    expect(publicEntryUndoable(entry("APPLICATION", "a1", "UPDATE_APPLICATION_NOTES", { previousValue: { notes: null } }))).toBe(false);
  });

  it("takes back a market's verification but no other market change", () => {
    const verification = entry("MARKET", "k1", "UPDATE_MARKET", { previousValue: { verificationStatus: "PENDING" }, newValue: { verificationStatus: "VERIFIED" } });
    expect(verificationOnly(verification)).toBe(true);
    expect(isUndoable(verification)).toBe(true);
    const details = entry("MARKET", "k1", "UPDATE_MARKET", { previousValue: { verificationStatus: "PENDING", name: "Old" } });
    expect(isUndoable(details)).toBe(false);
  });
});

describe("undo blockers for public items", () => {
  it("blocks an item whose status moved on since the decision", async () => {
    const entries = [
      entry("REVIEW", "r1", "UPDATE_REVIEW_STATUS", { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED" } }),
      entry("PHOTO", "p1", "UPDATE_PHOTO_STATUS", { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED" } }),
    ];
    mocks.reviewFindMany.mockResolvedValue([{ id: "r1", status: "APPROVED" }]);
    mocks.photoFindMany.mockResolvedValue([{ id: "p1", status: "REJECTED" }]);
    const rows = await loadPublicRows(entries);
    const current = new Map([...rows].map(([key, row]) => [key, { updatedAt: new Date(0), title: row.title, status: row.status }]));
    const blockers = undoBlockers(entries, current);
    expect(blockers).toEqual([{ targetType: "PHOTO", targetId: "p1", title: null, reason: "It changed after this decision." }]);
    expect(statusAfter(entries, "REVIEW:r1")).toBe("APPROVED");
  });
});

describe("restorePublicTarget", () => {
  it("puts the old status back only while the item has the decision's status", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = { report: { updateMany } } as never;
    const result = await restorePublicTarget(tx, [
      entry("REPORT", "x1", "UPDATE_REPORT_STATUS", {
        previousValue: { status: "PENDING", escalationStatus: "ESCALATED" },
        newValue: { status: "RESOLVED", escalationStatus: "CLOSED" },
      }),
    ]);
    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "x1", status: "RESOLVED" },
      data: { status: "PENDING", escalationStatus: "ESCALATED" },
    });
  });

  it("restores an application's notes and review stamp, and a message's read time", async () => {
    const appUpdate = vi.fn(async () => ({ count: 1 }));
    const messageUpdate = vi.fn(async () => ({ count: 0 }));
    const tx = { application: { updateMany: appUpdate }, contactMessage: { updateMany: messageUpdate } } as never;
    await restorePublicTarget(tx, [
      entry("APPLICATION", "a1", "REJECT_APPLICATION", {
        previousValue: { status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null },
        newValue: { status: "REJECTED" },
      }),
    ]);
    expect(appUpdate).toHaveBeenCalledWith({
      where: { id: "a1", status: "REJECTED" },
      data: { status: "PENDING", notes: null, reviewedAt: null, reviewedBy: null },
    });
    const result = await restorePublicTarget(tx, [
      entry("CONTACT_MESSAGE", "m1", "UPDATE_CONTACT_MESSAGE_STATUS", {
        previousValue: { status: "PENDING", readAt: null },
        newValue: { status: "READ", readAt: "2026-11-03T17:00:00.000Z" },
      }),
    ]);
    expect(messageUpdate).toHaveBeenCalledWith({ where: { id: "m1", status: "READ" }, data: { status: "PENDING", readAt: null } });
    expect(result).toEqual({ count: 0 });
  });
});

describe("restorePublicTarget for an application that changed the account", () => {
  const approved = (previousValue: Record<string, unknown>, newValue: Record<string, unknown>) =>
    entry("APPLICATION", "a1", "APPROVE_APPLICATION", { previousValue: { status: "PENDING", ...previousValue }, newValue: { status: "APPROVED", ...newValue } });

  it("puts the role back while the account still has the role the approval gave", async () => {
    const appUpdate = vi.fn(async () => ({ count: 1 }));
    const appFind = vi.fn(async () => ({ userId: "u1" }));
    const userUpdate = vi.fn(async () => ({ count: 1 }));
    const tx = { application: { updateMany: appUpdate, findUnique: appFind }, user: { updateMany: userUpdate } } as never;
    await restorePublicTarget(tx, [approved({ role: "USER" }, { role: "VENDOR" })]);
    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1", role: "VENDOR" }, data: { role: "USER" } });
  });

  it("puts the vendor verification back the same way", async () => {
    const vendorUpdate = vi.fn(async () => ({ count: 1 }));
    const tx = {
      application: { updateMany: vi.fn(async () => ({ count: 1 })), findUnique: vi.fn(async () => ({ userId: "u2" })) },
      vendorProfile: { updateMany: vendorUpdate },
    } as never;
    await restorePublicTarget(tx, [approved({ vendorVerification: "PENDING" }, { vendorVerification: "VERIFIED" })]);
    expect(vendorUpdate).toHaveBeenCalledWith({
      where: { userId: "u2", deletedAt: null, verificationStatus: "VERIFIED" },
      data: { verificationStatus: "PENDING" },
    });
  });

  it("leaves the account alone when the application itself moved on", async () => {
    const userUpdate = vi.fn();
    const appFind = vi.fn();
    const tx = { application: { updateMany: vi.fn(async () => ({ count: 0 })), findUnique: appFind }, user: { updateMany: userUpdate } } as never;
    expect(await restorePublicTarget(tx, [approved({ role: "USER" }, { role: "VENDOR" })])).toEqual({ count: 0 });
    expect(appFind).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe("undoDecision with public items", () => {
  it("puts an approved review back to waiting and records the undo", async () => {
    const approved = entry("REVIEW", "r1", "UPDATE_REVIEW_STATUS", {
      previousValue: { status: "PENDING" },
      newValue: { status: "APPROVED" },
      details: { decisionId: "d1", title: "the review of X" },
    });
    mocks.auditFindMany.mockResolvedValueOnce([approved]).mockResolvedValueOnce([]);
    mocks.reviewFindMany.mockResolvedValue([{ id: "r1", status: "APPROVED" }]);
    mocks.reviewUpdateMany.mockResolvedValue({ count: 1 });
    const result = await undoDecision("d1", "admin");
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Restored the review of X.");
    expect(mocks.reviewUpdateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "APPROVED" }, data: { status: "PENDING" } });
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "UNDO_DECISION", targetType: "REVIEW" }) }));
  });

  it("restores nothing when the item moved on during the undo", async () => {
    const approved = entry("REVIEW", "r1", "UPDATE_REVIEW_STATUS", { previousValue: { status: "PENDING" }, newValue: { status: "APPROVED" } });
    mocks.auditFindMany.mockResolvedValueOnce([approved]).mockResolvedValueOnce([]);
    mocks.reviewFindMany.mockResolvedValue([{ id: "r1", status: "APPROVED" }]);
    mocks.reviewUpdateMany.mockResolvedValue({ count: 0 });
    const result = await undoDecision("d1", "admin");
    expect(result.ok).toBe(false);
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });
});

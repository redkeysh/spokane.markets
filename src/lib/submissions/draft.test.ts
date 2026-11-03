import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  submissionFindUnique: vi.fn(),
  submissionUpdateMany: vi.fn(),
  marketFindFirst: vi.fn(),
  tagCount: vi.fn(),
  featureCount: vi.fn(),
  userFindUnique: vi.fn(),
  logAudit: vi.fn(),
  approve: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/submission-approval", () => ({
  ALREADY_REVIEWED_MESSAGE: "This submission was already reviewed.",
  approveSubmissionWithEvent: mocks.approve,
}));
vi.mock("@/lib/db", () => ({
  db: {
    submission: { findUnique: mocks.submissionFindUnique, updateMany: mocks.submissionUpdateMany },
    market: { findFirst: mocks.marketFindFirst },
    tag: { count: mocks.tagCount },
    feature: { count: mocks.featureCount },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { legacyDateFields, publishSubmission, saveSubmissionDraft } from "./draft";

const pending = {
  status: "PENDING",
  eventTitle: "Big Give",
  eventDescription: null,
  eventDate: "2027-07-17",
  eventTime: "11:00",
  endDate: null,
  endTime: "19:00",
  allDay: false,
  scheduleDays: null,
  venueName: "Shriners Event Center",
  venueAddress: "7217 W WESTBOW BLVD",
  venueCity: "SPOKANE",
  venueState: "WA",
  venueZip: "99224",
  marketId: null,
  tagIds: [],
  featureIds: [],
  imageUrl: null,
  websiteUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  notes: null,
  submitterEmail: "pat@example.com",
  submitterName: "Pat Lee",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submissionFindUnique.mockResolvedValue(pending);
  mocks.submissionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.tagCount.mockResolvedValue(1);
  mocks.featureCount.mockResolvedValue(0);
});

describe("saveSubmissionDraft", () => {
  it("saves schedule days, tags, market, place fields and links, and keeps the list fields in step", async () => {
    mocks.marketFindFirst.mockResolvedValue({ id: "m1" });
    const result = await saveSubmissionDraft(
      "s1",
      {
        scheduleDays: [
          { date: "2027-07-18", allDay: false, startTime: "10:00", endTime: "16:00" },
          { date: "2027-07-17", allDay: false, startTime: "11:00", endTime: "19:00" },
        ],
        tagIds: ["t1", "t1"],
        marketId: "m1",
        venueCity: "Spokane",
        websiteUrl: "jackedupbigshow.com",
      },
      "admin",
      { decisionId: "d1" }
    );
    expect(result).toEqual({ ok: true });
    const data = mocks.submissionUpdateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tagIds: ["t1"],
      marketId: "m1",
      venueCity: "Spokane",
      websiteUrl: "https://jackedupbigshow.com",
      eventDate: "2027-07-17",
      eventTime: "11:00",
      endDate: "2027-07-18",
      endTime: "16:00",
      allDay: false,
    });
    expect(data.scheduleDays).toHaveLength(2);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "admin",
      "UPDATE_SUBMISSION",
      "SUBMISSION",
      "s1",
      expect.objectContaining({ previousValue: expect.objectContaining({ venueCity: "SPOKANE" }), details: expect.objectContaining({ decisionId: "d1" }) })
    );
  });

  it("refuses a decided submission, an unknown tag and a bad ZIP", async () => {
    mocks.submissionFindUnique.mockResolvedValueOnce({ ...pending, status: "APPROVED" });
    await expect(saveSubmissionDraft("s1", { eventTitle: "X" }, "admin")).resolves.toEqual({ ok: false, error: "Only pending submissions can be edited." });
    mocks.tagCount.mockResolvedValueOnce(0);
    await expect(saveSubmissionDraft("s1", { tagIds: ["nope"] }, "admin")).resolves.toEqual({ ok: false, error: "One of the tags no longer exists." });
    await expect(saveSubmissionDraft("s1", { venueZip: "992" }, "admin")).resolves.toMatchObject({ ok: false });
    expect(mocks.submissionUpdateMany).not.toHaveBeenCalled();
  });
});

describe("publishSubmission", () => {
  it("saves the draft first, then approves, and names who was told", async () => {
    mocks.approve.mockResolvedValue({ id: "e1", slug: "big-give" });
    mocks.userFindUnique.mockResolvedValue({ id: "u1" });
    const result = await publishSubmission("s1", { venueCity: "Spokane" }, "admin", { decisionId: "d2" });
    expect(result).toEqual({ ok: true, eventId: "e1", slug: "big-give", notified: ["Pat Lee"] });
    expect(mocks.submissionUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.approve.mock.invocationCallOrder[0]);
    expect(mocks.approve).toHaveBeenCalledWith("s1", "admin", {
      auditMeta: { details: { decisionId: "d2", title: "Big Give", at: expect.any(String), notified: ["Pat Lee"] } },
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({ where: { email: "pat@example.com" }, select: { id: true } });
    expect(mocks.userFindUnique.mock.invocationCallOrder[0]).toBeLessThan(mocks.approve.mock.invocationCallOrder[0]);
  });

  it("names nobody when the submitter has no account", async () => {
    mocks.approve.mockResolvedValue({ id: "e1", slug: "big-give" });
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(publishSubmission("s1", null, "admin")).resolves.toMatchObject({ ok: true, notified: [] });
    expect(mocks.approve.mock.calls[0][2].auditMeta.details).not.toHaveProperty("notified");
  });

  it("reports a submission someone else reviewed first", async () => {
    mocks.approve.mockResolvedValue(null);
    await expect(publishSubmission("s1", null, "admin")).resolves.toEqual({ ok: false, error: "This submission was already reviewed." });
  });

  it("passes an approval error through as a message", async () => {
    mocks.approve.mockRejectedValue(new Error("Cannot approve: missing ZIP"));
    await expect(publishSubmission("s1", null, "admin")).resolves.toEqual({ ok: false, error: "Cannot approve: missing ZIP" });
  });
});

describe("legacyDateFields", () => {
  it("marks a run of all-day days as all day", () => {
    expect(legacyDateFields([{ date: "2026-12-05", allDay: true }])).toEqual({
      eventDate: "2026-12-05",
      eventTime: "00:00",
      endDate: null,
      endTime: null,
      allDay: true,
    });
  });
});

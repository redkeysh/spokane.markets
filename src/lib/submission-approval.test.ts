import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Submission } from "@prisma/client";

const {
  findFirstMock,
  submissionFindUniqueMock,
  submissionUpdateMock,
  submissionUpdateManyMock,
  tagFindManyMock,
  featureFindManyMock,
  userFindUniqueMock,
  createEventMock,
  createNotificationMock,
  logAuditMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  submissionFindUniqueMock: vi.fn(),
  submissionUpdateMock: vi.fn(),
  submissionUpdateManyMock: vi.fn(),
  tagFindManyMock: vi.fn(),
  featureFindManyMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
  createEventMock: vi.fn(),
  createNotificationMock: vi.fn(),
  logAuditMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    event: { findFirst: findFirstMock },
    submission: {
      findUnique: submissionFindUniqueMock,
      update: submissionUpdateMock,
      updateMany: submissionUpdateManyMock,
    },
    user: { findUnique: userFindUniqueMock },
    tag: { findMany: tagFindManyMock },
    feature: { findMany: featureFindManyMock },
  },
}));
vi.mock("@/lib/shared/event-service", () => ({ createEvent: createEventMock }));
vi.mock("@/lib/notifications", () => ({ createNotification: createNotificationMock }));
vi.mock("@/lib/audit", () => ({ logAudit: logAuditMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  approveSubmissionWithEvent,
  rejectSubmission,
  buildEventDataFromSubmission,
  ensureUniqueEventSlug,
  submissionHasCompleteVenueForEvent,
} from "./submission-approval";

describe("buildEventDataFromSubmission", () => {
  it("maps a single-day submission to EventData", () => {
    const sub = {
      eventTitle: "Test Event",
      eventDate: "2026-07-04",
      eventTime: "14:00",
      endDate: null,
      endTime: null,
      allDay: false,
      scheduleDays: null,
      eventDescription: "Desc",
      imageUrl: null,
      websiteUrl: null,
      facebookUrl: null,
      instagramUrl: "https://instagram.com/myevent",
      marketId: null,
      tagIds: [],
      featureIds: [],
      venueName: "Venue",
      venueAddress: "1 St",
      venueCity: "Spokane",
      venueState: "WA",
      venueZip: "99201",
    } as unknown as Submission;

    const data = buildEventDataFromSubmission(sub, "test-event");
    expect(data.title).toBe("Test Event");
    expect(data.slug).toBe("test-event");
    expect(data.venueCity).toBe("Spokane");
    expect(data.instagramUrl).toBe("https://instagram.com/myevent");
    expect(data.scheduleDays).toBeUndefined();
  });

  it("uses scheduleDays JSON when present", () => {
    const sub = {
      eventTitle: "Multi",
      eventDate: "2026-07-01",
      eventTime: "09:00",
      endDate: "2026-07-02",
      endTime: "17:00",
      allDay: false,
      scheduleDays: [
        { date: "2026-07-01", allDay: false, startTime: "09:00", endTime: "17:00" },
        { date: "2026-07-02", allDay: false, startTime: "09:00", endTime: "17:00" },
      ],
      eventDescription: null,
      imageUrl: null,
      websiteUrl: null,
      facebookUrl: null,
      instagramUrl: null,
      marketId: null,
      tagIds: [],
      featureIds: [],
      venueName: "Hall",
      venueAddress: "1 St",
      venueCity: "Spokane",
      venueState: "WA",
      venueZip: "99201",
    } as unknown as Submission;

    const data = buildEventDataFromSubmission(sub, "multi");
    expect(data.scheduleDays?.length).toBe(2);
    expect(data.scheduleDays?.[0].date).toBe("2026-07-01");
  });
});

describe("submissionHasCompleteVenueForEvent", () => {
  const base = {
    venueName: "Hall",
    venueAddress: "1 St",
    venueCity: "Spokane",
    venueState: "WA",
    venueZip: "99201",
  } as unknown as Submission;

  it("returns true when all venue fields are non-empty", () => {
    expect(submissionHasCompleteVenueForEvent(base)).toBe(true);
  });

  it("returns false when zip is missing", () => {
    expect(
      submissionHasCompleteVenueForEvent({
        ...base,
        venueZip: "",
      } as Submission),
    ).toBe(false);
  });
});

describe("ensureUniqueEventSlug", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("returns base slug when unused", async () => {
    findFirstMock.mockResolvedValue(null);
    const slug = await ensureUniqueEventSlug("My Great Event!");
    expect(slug).toBe("my-great-event");
    expect(findFirstMock).toHaveBeenCalled();
  });

  it("treats an archived event's slug as taken", async () => {
    findFirstMock.mockResolvedValue(null);
    await ensureUniqueEventSlug("Hello");
    expect(findFirstMock).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: "hello" } }));
  });

  it("appends suffix when slug exists", async () => {
    findFirstMock
      .mockResolvedValueOnce({ id: "e1" })
      .mockResolvedValueOnce(null);
    const slug = await ensureUniqueEventSlug("Hello");
    expect(slug).toBe("hello-1");
  });
});

describe("approveSubmissionWithEvent", () => {
  const pendingSubmission = {
    id: "sub-1",
    status: "PENDING",
    reviewerId: null,
    createdEventId: null,
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    submitterEmail: "maker@example.com",
    eventTitle: "Market Day",
    eventDate: "2026-07-04",
    eventTime: "10:00",
    endDate: null,
    endTime: "15:00",
    allDay: false,
    scheduleDays: null,
    eventDescription: null,
    imageUrl: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    marketId: null,
    tagIds: [],
    featureIds: [],
    venueName: "Shriners Event Center",
    venueAddress: "7217 W Westbow Blvd",
    venueCity: "Spokane",
    venueState: "WA",
    venueZip: "99224",
  };

  const tx = { submission: { updateMany: submissionUpdateManyMock } };

  beforeEach(() => {
    vi.clearAllMocks();
    findFirstMock.mockResolvedValue(null);
    submissionFindUniqueMock.mockResolvedValue(pendingSubmission);
    userFindUniqueMock.mockResolvedValue({ id: "user-1" });
    submissionUpdateManyMock.mockResolvedValue({ count: 1 });
    tagFindManyMock.mockResolvedValue([]);
    featureFindManyMock.mockResolvedValue([]);
    createEventMock.mockImplementation(async (_data, options) => {
      const event = { id: "event-1", slug: "market-day" };
      await options.inTransaction?.(tx, event);
      return { event, error: null };
    });
  });

  it("publishes the event instead of sending it to a second review", async () => {
    const result = await approveSubmissionWithEvent("sub-1", "admin-1");
    expect(result).toEqual({ id: "event-1", slug: "market-day" });
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "market-day" }),
      expect.objectContaining({ status: "PUBLISHED", submittedById: "user-1" })
    );
  });

  it("marks the submission approved inside the event transaction, only as it was read", async () => {
    await approveSubmissionWithEvent("sub-1", "admin-1");
    expect(submissionUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: "sub-1",
        status: "PENDING",
        createdEventId: null,
        updatedAt: pendingSubmission.updatedAt,
      },
      data: { status: "APPROVED", reviewerId: "admin-1", createdEventId: "event-1" },
    });
    expect(submissionUpdateMock).not.toHaveBeenCalled();
  });

  it("drops tags and features that no longer exist", async () => {
    submissionFindUniqueMock.mockResolvedValue({
      ...pendingSubmission,
      tagIds: ["tag-live", "tag-deleted"],
      featureIds: ["feature-deleted"],
    });
    tagFindManyMock.mockResolvedValue([{ id: "tag-live" }]);
    featureFindManyMock.mockResolvedValue([]);
    await approveSubmissionWithEvent("sub-1", "admin-1");
    expect(createEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ tagIds: ["tag-live"], featureIds: [] }),
      expect.anything()
    );
  });

  it("links the submitter to the live event and refreshes its page", async () => {
    await approveSubmissionWithEvent("sub-1", "admin-1");
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SUBMISSION_APPROVED", link: "/events/market-day" })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/events/market-day");
  });

  it("rolls back and reports nothing when another reviewer got there first", async () => {
    submissionUpdateManyMock.mockResolvedValue({ count: 0 });
    submissionFindUniqueMock
      .mockResolvedValueOnce(pendingSubmission)
      .mockResolvedValueOnce({ status: "REJECTED", createdEventId: null });
    expect(await approveSubmissionWithEvent("sub-1", "admin-1")).toBeNull();
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("rolls back and asks for another look when the submission was edited meanwhile", async () => {
    submissionUpdateManyMock.mockResolvedValue({ count: 0 });
    submissionFindUniqueMock
      .mockResolvedValueOnce(pendingSubmission)
      .mockResolvedValueOnce({ status: "PENDING", createdEventId: null });
    await expect(approveSubmissionWithEvent("sub-1", "admin-1")).rejects.toThrow("edited while it was being approved");
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("treats a slug clash with a concurrent approval of the same submission as already reviewed", async () => {
    createEventMock.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    submissionFindUniqueMock
      .mockResolvedValueOnce(pendingSubmission)
      .mockResolvedValueOnce({ status: "APPROVED", createdEventId: "event-other" });
    expect(await approveSubmissionWithEvent("sub-1", "admin-1")).toBeNull();
  });

  it("still reports a committed approval when the notification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createNotificationMock.mockRejectedValue(new Error("connection reset"));
    expect(await approveSubmissionWithEvent("sub-1", "admin-1")).toEqual({ id: "event-1", slug: "market-day" });
    expect(logAuditMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/events/market-day");
    consoleError.mockRestore();
  });

  it("surfaces a venue error and leaves the submission pending", async () => {
    createEventMock.mockResolvedValue({ event: null, error: "Could not find the location." });
    await expect(approveSubmissionWithEvent("sub-1", "admin-1")).rejects.toThrow("Could not find the location.");
    expect(submissionUpdateManyMock).not.toHaveBeenCalled();
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it("explains a slug taken by a concurrent event", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    createEventMock.mockRejectedValue(p2002);
    submissionFindUniqueMock
      .mockResolvedValueOnce(pendingSubmission)
      .mockResolvedValueOnce({ status: "PENDING", createdEventId: null });
    findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "other-event" });
    await expect(approveSubmissionWithEvent("sub-1", "admin-1")).rejects.toThrow("Try approving again");
  });

  it("passes through a unique violation that is not about the slug", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed on (eventId, date)"), { code: "P2002" });
    createEventMock.mockRejectedValue(p2002);
    submissionFindUniqueMock
      .mockResolvedValueOnce(pendingSubmission)
      .mockResolvedValueOnce({ status: "PENDING", createdEventId: null });
    await expect(approveSubmissionWithEvent("sub-1", "admin-1")).rejects.toBe(p2002);
  });

  it("does nothing for a submission that was already approved", async () => {
    submissionFindUniqueMock.mockResolvedValue({ ...pendingSubmission, status: "APPROVED" });
    expect(await approveSubmissionWithEvent("sub-1", "admin-1")).toBeNull();
    expect(createEventMock).not.toHaveBeenCalled();
    expect(submissionUpdateManyMock).not.toHaveBeenCalled();
  });
});

describe("rejectSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submissionFindUniqueMock.mockResolvedValue({ submitterEmail: "maker@example.com", status: "PENDING" });
    submissionUpdateManyMock.mockResolvedValue({ count: 1 });
    userFindUniqueMock.mockResolvedValue({ id: "user-1" });
  });

  it("rejects only while pending and notifies the submitter", async () => {
    expect(await rejectSubmission("sub-1", "admin-1", "Duplicate listing")).toEqual({ ok: true });
    expect(submissionUpdateManyMock).toHaveBeenCalledWith({
      where: { id: "sub-1", status: "PENDING" },
      data: { status: "REJECTED", reviewerId: "admin-1", reviewNotes: "Duplicate listing" },
    });
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SUBMISSION_REJECTED", userId: "user-1" })
    );
  });

  it("does not overwrite a submission someone else already reviewed", async () => {
    submissionUpdateManyMock.mockResolvedValue({ count: 0 });
    expect(await rejectSubmission("sub-1", "admin-1", "Duplicate listing")).toMatchObject({
      ok: false,
      reason: "already_reviewed",
    });
    expect(createNotificationMock).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("still reports a committed rejection when the notification fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createNotificationMock.mockRejectedValue(new Error("connection reset"));
    expect(await rejectSubmission("sub-1", "admin-1", "Duplicate listing")).toEqual({ ok: true });
    expect(logAuditMock).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports a missing submission", async () => {
    submissionFindUniqueMock.mockResolvedValue(null);
    expect(await rejectSubmission("missing", "admin-1", null)).toMatchObject({ ok: false, reason: "not_found" });
  });
});

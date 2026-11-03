import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenPrincipal } from "@/lib/api-tokens";

const mocks = vi.hoisted(() => ({
  submissionFindMany: vi.fn(),
  submissionFindUnique: vi.fn(),
  submissionCount: vi.fn(),
  eventFindMany: vi.fn(),
  eventFindFirst: vi.fn(),
  eventFindUnique: vi.fn(),
  eventCount: vi.fn(),
  approveSubmissionWithEvent: vi.fn(),
  findMatchingVenue: vi.fn(),
  venueFindMany: vi.fn(),
  venueFindFirst: vi.fn(),
  venueCount: vi.fn(),
  venueUpdate: vi.fn(),
  geocodeAddress: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    submission: {
      findMany: mocks.submissionFindMany,
      findUnique: mocks.submissionFindUnique,
      count: mocks.submissionCount,
    },
    event: {
      findMany: mocks.eventFindMany,
      findFirst: mocks.eventFindFirst,
      findUnique: mocks.eventFindUnique,
      count: mocks.eventCount,
    },
    venue: {
      findMany: mocks.venueFindMany,
      findFirst: mocks.venueFindFirst,
      count: mocks.venueCount,
      update: mocks.venueUpdate,
    },
  },
}));
vi.mock("@/lib/admin/queues", () => ({ getQueuesSummary: vi.fn() }));
vi.mock("@/lib/submission-approval", () => ({
  ALREADY_REVIEWED_MESSAGE: "This submission was already reviewed.",
  approveSubmissionWithEvent: mocks.approveSubmissionWithEvent,
  rejectSubmission: vi.fn(),
}));
vi.mock("@/lib/events/status-notifications", () => ({ notifySubmitterOfStatusChange: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/geocode", () => ({ geocodeAddress: mocks.geocodeAddress }));
vi.mock("@/lib/neighborhoods", () => ({ assertNeighborhoodSlug: vi.fn() }));
vi.mock("@/lib/venues/resolve", () => ({ findMatchingVenue: mocks.findMatchingVenue }));
vi.mock("@/lib/venues/merge", () => ({ mergeVenues: vi.fn() }));

import { ADMIN_TOOLS } from "./admin-tools";

function principal(access: "READ" | "WRITE"): TokenPrincipal {
  return {
    tokenId: "tok1",
    tokenName: "Claude",
    access,
    user: { id: "admin-1", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    permissions: ["admin.moderation.manage", "admin.listings.manage"],
  };
}

async function callTool(name: string, args: unknown, access: "READ" | "WRITE" = "WRITE") {
  const tool = ADMIN_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`No tool ${name}`);
  const ctx = principal(access);
  const reason = tool.unavailableReason(ctx);
  if (reason) return { isError: true as const, text: reason };
  return tool.call(args, ctx);
}

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    status: "PENDING",
    eventTitle: "Market Day",
    eventDescription: "x".repeat(5000),
    submitterName: "Maker",
    submitterEmail: "maker@example.com",
    eventDate: "2026-07-04",
    eventTime: "10:00",
    endDate: null,
    endTime: null,
    allDay: false,
    scheduleDays: [
      { date: "2026-07-05", allDay: true },
      { date: "2026-07-04", allDay: true },
    ],
    venueName: "Hall",
    venueAddress: "1 Main St",
    venueCity: "Spokane",
    venueState: "WA",
    venueZip: "99201",
    marketId: null,
    imageUrl: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    notes: null,
    reviewNotes: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    createdEventId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMatchingVenue.mockResolvedValue(null);
});

describe("tool gating", () => {
  it("keeps write tools away from read-only tokens", async () => {
    const result = await callTool("approve_submission", { id: "sub-1" }, "READ");
    expect(result).toMatchObject({ isError: true });
    expect(mocks.approveSubmissionWithEvent).not.toHaveBeenCalled();
  });
});

describe("list_submissions", () => {
  it("returns a page with a total and shortens long text", async () => {
    mocks.submissionFindMany.mockResolvedValue([submissionRow()]);
    mocks.submissionCount.mockResolvedValue(3);

    const result = await callTool("list_submissions", { limit: 1 });
    expect(result.isError).toBe(false);
    if (result.isError) return;
    const data = result.data as {
      total: number;
      hasMore: boolean;
      items: { eventDescription: string; scheduleDays: unknown }[];
    };
    expect(data).toMatchObject({ total: 3, offset: 0, returned: 1, hasMore: true });
    expect(data.items[0].eventDescription.length).toBeLessThan(400);
    expect(data.items[0].eventDescription).toContain("more characters not shown");
    expect(data.items[0].scheduleDays).toEqual({ days: 2, firstDate: "2026-07-04", lastDate: "2026-07-05" });
    expect(mocks.submissionFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it("passes the offset through for the next page", async () => {
    mocks.submissionFindMany.mockResolvedValue([submissionRow()]);
    mocks.submissionCount.mockResolvedValue(3);
    const result = await callTool("list_submissions", { limit: 2, offset: 2 });
    expect(mocks.submissionFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 2 }));
    expect(result).toMatchObject({ isError: false, data: { returned: 1, hasMore: false } });
  });
});

describe("search_events", () => {
  it.each([
    ["upcoming", "asc"],
    ["past", "desc"],
    ["all", "desc"],
  ])("orders %s events by start date %s", async (when, direction) => {
    mocks.eventFindMany.mockResolvedValue([]);
    mocks.eventCount.mockResolvedValue(0);
    await callTool("search_events", { when });
    expect(mocks.eventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ startDate: direction }, { id: "asc" }] })
    );
  });
});

describe("update_event", () => {
  it("accepts an /uploads/ image path", async () => {
    mocks.eventFindFirst.mockResolvedValue(null);
    const result = await callTool("update_event", { id: "e1", imageUrl: "/uploads/submissions/a.webp" });
    expect(result).toEqual({ isError: true, text: "Event not found or archived." });
  });

  it.each(["ftp://host/banner.jpg", "javascript:alert(1)", "data:image/png;base64,AAAA"])(
    "rejects a non-http image URL (%s)",
    async (imageUrl) => {
      const result = await callTool("update_event", { id: "e1", imageUrl });
      expect(result).toMatchObject({ isError: true });
      expect(mocks.eventFindFirst).not.toHaveBeenCalled();
    }
  );

  it("rejects a non-http website URL", async () => {
    const result = await callTool("update_event", { id: "e1", websiteUrl: "ftp://example.com" });
    expect(result).toMatchObject({ isError: true });
    expect(mocks.eventFindFirst).not.toHaveBeenCalled();
  });
});

describe("approve_submission", () => {
  it("reports a submission that was reviewed while the approval ran", async () => {
    mocks.submissionFindUnique.mockResolvedValue({ status: "PENDING" });
    mocks.approveSubmissionWithEvent.mockResolvedValue(null);
    const result = await callTool("approve_submission", { id: "sub-1" });
    expect(result).toEqual({ isError: true, text: "This submission was already reviewed." });
  });

  it("returns the published event", async () => {
    mocks.submissionFindUnique.mockResolvedValue({ status: "PENDING" });
    mocks.approveSubmissionWithEvent.mockResolvedValue({ id: "event-1", slug: "market-day" });
    mocks.eventFindUnique.mockResolvedValue({ id: "event-1", title: "Market Day", slug: "market-day", status: "PUBLISHED" });
    const result = await callTool("approve_submission", { id: "sub-1" });
    expect(result).toMatchObject({
      isError: false,
      data: { approved: true, event: { id: "event-1", status: "PUBLISHED" } },
    });
  });
});

describe("search_venues", () => {
  it("returns each venue's coordinates", async () => {
    mocks.venueFindMany.mockResolvedValue([]);
    mocks.venueCount.mockResolvedValue(0);
    await callTool("search_venues", { query: "expo" });
    expect(mocks.venueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ lat: true, lng: true }) })
    );
  });
});

describe("update_venue coordinates", () => {
  const venue = {
    id: "v1",
    name: "Spokane County Fair & Expo Center",
    address: "404 N Havana St",
    city: "Spokane Valley",
    state: "WA",
    zip: "99216",
    lat: 47.7,
    lng: -117.5,
    neighborhood: null,
    parkingNotes: null,
  };

  beforeEach(() => {
    mocks.venueFindFirst.mockResolvedValue(venue);
    mocks.venueUpdate.mockImplementation(async ({ data }: { data: object }) => ({ ...venue, ...data }));
  });

  it("geocodes the current address again on relocate and audits the move", async () => {
    mocks.geocodeAddress.mockResolvedValue({ lat: 47.6626, lng: -117.3511 });
    const result = await callTool("update_venue", { id: "v1", relocate: true });

    expect(mocks.geocodeAddress).toHaveBeenCalledWith({
      address: "404 N Havana St",
      city: "Spokane Valley",
      state: "WA",
      zip: "99216",
    });
    expect(mocks.venueUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { lat: 47.6626, lng: -117.3511 } });
    expect(result).toMatchObject({ isError: false, data: { lat: 47.6626, lng: -117.3511 } });
    expect(mocks.logAudit).toHaveBeenCalledWith(
      "admin-1",
      "UPDATE_VENUE",
      "VENUE",
      "v1",
      expect.objectContaining({
        previousValue: expect.objectContaining({ lat: 47.7, lng: -117.5 }),
        newValue: { relocate: true, lat: 47.6626, lng: -117.3511 },
        via: "mcp",
        tokenId: "tok1",
      })
    );
  });

  it("saves explicit coordinates without geocoding", async () => {
    const result = await callTool("update_venue", { id: "v1", lat: 47.6626, lng: -117.3511 });
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    expect(mocks.venueUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { lat: 47.6626, lng: -117.3511 } });
    expect(result).toMatchObject({ isError: false });
  });

  it("uses explicit coordinates instead of geocoding a changed address", async () => {
    await callTool("update_venue", { id: "v1", address: "406 N Havana St", lat: 47.6626, lng: -117.3511 });
    expect(mocks.geocodeAddress).not.toHaveBeenCalled();
    expect(mocks.venueUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { address: "406 N Havana St", lat: 47.6626, lng: -117.3511 },
    });
  });

  it.each([
    [{ lat: 39.74, lng: -104.99 }],
    [{ lat: 47.66 }],
    [{ relocate: true, lat: 47.66, lng: -117.35 }],
    [{ relocate: false }],
  ])("rejects %o before touching the venue", async (args) => {
    const result = await callTool("update_venue", { id: "v1", ...args });
    expect(result).toMatchObject({ isError: true });
    expect(mocks.venueFindFirst).not.toHaveBeenCalled();
  });

  it("rejects a geocode that lands outside the service area", async () => {
    mocks.geocodeAddress.mockResolvedValue({ lat: 39.74, lng: -104.99 });
    const result = await callTool("update_venue", { id: "v1", relocate: true });
    expect(result).toMatchObject({ isError: true, text: expect.stringContaining("outside the Spokane and North Idaho area") });
    expect(mocks.venueUpdate).not.toHaveBeenCalled();
  });

  it("reports an address no geocoder can place", async () => {
    mocks.geocodeAddress.mockResolvedValue(null);
    const result = await callTool("update_venue", { id: "v1", relocate: true });
    expect(result).toMatchObject({ isError: true, text: expect.stringContaining("Couldn't find the address") });
    expect(mocks.venueUpdate).not.toHaveBeenCalled();
  });
});

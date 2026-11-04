import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  describeRow,
  fieldLabel,
  formatValue,
  groupDetails,
  historySince,
  historyWhere,
  isHistoryCursor,
  rowDetails,
  type HistoryAuditRow,
  type HistoryFilters,
} from "./history-words";

const DEFAULT_FILTERS: HistoryFilters = { q: "", what: "anything", who: "anyone", when: "30" };

const NOW = new Date("2026-11-03T17:41:00Z");

let seq = 0;
function row(overrides: Partial<HistoryAuditRow> & { meta?: Record<string, unknown> } = {}): HistoryAuditRow {
  seq += 1;
  const { meta, ...rest } = overrides;
  return {
    id: `r${String(seq).padStart(3, "0")}`,
    userId: "admin",
    action: "UPDATE_EVENT",
    targetType: "EVENT",
    targetId: `e${seq}`,
    createdAt: NOW,
    user: { name: "Hunter", email: "hunter@example.com" },
    metadata: (meta ?? {
      previousValue: { status: "PENDING" },
      newValue: { status: "PUBLISHED" },
      details: { title: `Event ${seq}` },
    }) as HistoryAuditRow["metadata"],
    ...rest,
  };
}

describe("historySince", () => {
  it("starts at Pacific midnight", () => {
    expect(historySince("today", NOW)?.toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(historySince("7", NOW)?.toISOString()).toBe("2026-10-28T07:00:00.000Z");
    expect(historySince("all", NOW)).toBeNull();
  });
});

describe("historyWhere", () => {
  it("limits the defaults to the last 30 days only", () => {
    expect(historyWhere(DEFAULT_FILTERS, "me", NOW)).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-10-05T07:00:00.000Z") } }],
    });
  });

  it("returns no condition for anything at any time by anyone", () => {
    expect(historyWhere({ ...DEFAULT_FILTERS, when: "all" }, "me", NOW)).toEqual({});
  });

  it("reads You as the viewer and API tokens from the entry's metadata", () => {
    const you = historyWhere({ ...DEFAULT_FILTERS, when: "all", who: "you" }, "me", NOW);
    expect(you).toEqual({ AND: [{ userId: "me" }] });
    const tokens = historyWhere({ ...DEFAULT_FILTERS, when: "all", who: "tokens" }, "me", NOW);
    expect(tokens).toEqual({ AND: [{ metadata: { path: ["via"], equals: "mcp" } }] });
    const person = historyWhere({ ...DEFAULT_FILTERS, when: "all", who: "u42" }, "me", NOW);
    expect(person).toEqual({ AND: [{ userId: "u42" }] });
  });

  it("finds publishing of events and approvals of what the public sent", () => {
    const where = historyWhere({ ...DEFAULT_FILTERS, when: "all", what: "publishing" }, "me", NOW);
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ action: "UPDATE_EVENT", metadata: { path: ["newValue", "status"], equals: "PUBLISHED" } });
    expect(or).toContainEqual(
      expect.objectContaining({ metadata: { path: ["newValue", "status"], equals: "APPROVED" } })
    );
  });

  it("searches titles, token names and people without regard to case", () => {
    const where = historyWhere({ ...DEFAULT_FILTERS, when: "all", q: "Rebel" }, "me", NOW);
    const or = (where.AND as { OR: unknown[] }[])[0].OR;
    expect(or).toContainEqual({ metadata: { path: ["details", "title"], string_contains: "Rebel", mode: "insensitive" } });
    expect(or).toContainEqual({ user: { name: { contains: "Rebel", mode: "insensitive" } } });
  });
});

describe("formatValue and fieldLabel", () => {
  it("speaks statuses, booleans and archive state in words", () => {
    expect(formatValue("status", "PUBLISHED")).toBe("Published");
    expect(formatValue("access", "WRITE")).toBe("Read and write");
    expect(formatValue("showImageInList", false)).toBe("No");
    expect(formatValue("deletedAt", null)).toBe("No");
    expect(formatValue("deletedAt", "2026-11-03T17:41:00.000Z")).toBe("Yes");
    expect(formatValue("websiteUrl", null)).toBeNull();
  });

  it("formats instants, dates, lists and schedules", () => {
    expect(formatValue("expiresAt", "2026-11-03T17:41:00.000Z", NOW)).toBe("Nov 3, 2026 at 9:41 am");
    expect(formatValue("date", "2026-11-07", NOW)).toBe("Sat Nov 7");
    expect(formatValue("tagIds", ["a", "b", "c"])).toBe("3 chosen");
    expect(formatValue("mergedNames", ["Expo Center", "Spokane Expo"])).toBe("Expo Center, Spokane Expo");
    expect(
      formatValue(
        "scheduleDays",
        [
          { date: "2026-11-07", startTime: "10:00", endTime: "16:00", allDay: false },
          { date: "2026-11-08", startTime: "00:00", endTime: "23:59", allDay: true },
        ],
        NOW
      )
    ).toBe("Sat Nov 7, 10:00 am to 4:00 pm; Sun Nov 8, all day");
  });

  it("clips long text", () => {
    const text = formatValue("description", "a".repeat(500));
    expect(text).toHaveLength(240);
    expect(text?.endsWith("…")).toBe(true);
  });

  it("labels known fields in the owner's words and others in sentence case", () => {
    expect(fieldLabel("venueId")).toBe("Place");
    expect(fieldLabel("vendorCapacity")).toBe("Vendor capacity");
    expect(fieldLabel("UPDATE_MODE")).toBe("Update mode");
  });
});

describe("rowDetails and groupDetails", () => {
  it("lists before and after per field", () => {
    const r = row({ meta: { previousValue: { status: "PENDING", title: "Old" }, newValue: { status: "PUBLISHED", title: "New" } } });
    expect(rowDetails(r)).toEqual([
      { label: "Status", before: "Pending", after: "Published" },
      { label: "Title", before: "Old", after: "New" },
    ]);
  });

  it("shows legacy metadata as after values and hides how the entry was made", () => {
    const r = row({ action: "CREATE_API_TOKEN", meta: { name: "Claude", access: "READ", via: "mcp", tokenName: "x" } });
    expect(rowDetails(r)).toEqual([
      { label: "Name", before: null, after: "Claude" },
      { label: "Access", before: null, after: "Read only" },
    ]);
  });

  it("lists each field once for a decision over several records", () => {
    const a = row({ meta: { previousValue: { status: "PENDING" }, newValue: { status: "PUBLISHED" }, details: { title: "Emerge" } } });
    const b = row({ meta: { previousValue: { status: "DRAFT" }, newValue: { status: "PUBLISHED" }, details: { title: "SouperBowl" } } });
    const c = row({ meta: { previousValue: { status: "PENDING" }, newValue: { status: "PUBLISHED" }, details: { title: "Fair" } } });
    expect(groupDetails([a, b, c])).toEqual([{ label: "Status", before: "Pending or Draft", after: "Published" }]);
  });
});

describe("describeRow", () => {
  it("says how many places a merge folded in and how many events moved", () => {
    const r = row({
      action: "MERGE_VENUES",
      targetType: "VENUE",
      targetId: "v1",
      meta: { mergedIds: ["v2", "v3"], mergedNames: ["SCC Lair", "The Lair"], eventsMoved: 1, details: { title: "Spokane Community College" } },
    });
    expect(describeRow(r, "admin")).toEqual({
      sentence: "You merged 2 places into Spokane Community College. 1 event moved.",
      link: { title: "Spokane Community College", href: "/admin/venues/v1" },
    });
  });

  it("names tokens, account changes and archived places", () => {
    const token = row({ action: "CREATE_API_TOKEN", targetType: "API_TOKEN", meta: { name: "Claude on my laptop", access: "WRITE" } });
    expect(describeRow(token, "admin").sentence).toBe("You made the API token Claude on my laptop, read and write.");
    const account = row({
      action: "UPDATE_USER",
      targetType: "USER",
      targetId: "u9",
      userId: "other",
      meta: { previousValue: { role: "USER", accountStatus: "ACTIVE" }, newValue: { role: "ORGANIZER", accountStatus: "ACTIVE" } },
    });
    expect(describeRow(account, "admin", new Map([["u9", "Jane Doe"]]))).toEqual({
      sentence: "Hunter changed the account of Jane Doe: role to organizer.",
      link: { title: "Jane Doe", href: "/admin/users/u9" },
    });
    expect(describeRow(account, "admin")).toEqual({ sentence: "Hunter changed an account: role to organizer.", link: null });
    const archived = row({ action: "SOFT_DELETE_VENUE", targetType: "VENUE", targetId: "v7", meta: { previousValue: { deletedAt: null } } });
    expect(describeRow(archived, "admin")).toEqual({ sentence: "You archived a place.", link: { title: "a place", href: "/admin/venues/v7" } });
  });

  it("falls back to the shared sentence with the record linked", () => {
    const r = row({ targetId: "evt9", meta: { previousValue: { status: "PENDING" }, newValue: { status: "REJECTED" }, details: { title: "Ski Swap" } } });
    expect(describeRow(r, "admin")).toEqual({ sentence: "You rejected Ski Swap.", link: { title: "Ski Swap", href: "/admin/events/evt9" } });
  });
});

describe("isHistoryCursor", () => {
  it("accepts an ISO time and an id, nothing else", () => {
    expect(isHistoryCursor({ at: "2026-11-03T16:00:00.000Z", id: "r1" })).toBe(true);
    expect(isHistoryCursor({ at: "yesterday", id: "r1" })).toBe(false);
    expect(isHistoryCursor({ at: "2026-11-03T16:00:00.000Z", id: "" })).toBe(false);
    expect(isHistoryCursor(null)).toBe(false);
  });
});

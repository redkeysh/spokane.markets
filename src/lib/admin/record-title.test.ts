import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth-utils", () => ({ getSession: mocks.getSession }));

import { adminRecordTitle, isActiveAdmin } from "./record-title";

const admin = { user: { id: "a", role: "ADMIN", accountStatus: "ACTIVE" } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isActiveAdmin", () => {
  it("is true only for an admin whose account is active", () => {
    expect(isActiveAdmin(admin.user)).toBe(true);
    expect(isActiveAdmin({ role: "ADMIN", accountStatus: "SUSPENDED" })).toBe(false);
    expect(isActiveAdmin({ role: "ORGANIZER", accountStatus: "ACTIVE" })).toBe(false);
    expect(isActiveAdmin(null)).toBe(false);
  });
});

describe("adminRecordTitle", () => {
  it("names the record for an active admin", async () => {
    mocks.getSession.mockResolvedValue(admin);
    expect(await adminRecordTitle("Event", async () => "  Family Fall Festival 2027 ")).toEqual({ title: "Family Fall Festival 2027" });
  });

  it("never reads the record for a signed-out visitor or a non-admin", async () => {
    const load = vi.fn(async () => "Family Fall Festival 2027");
    mocks.getSession.mockResolvedValue(null);
    expect(await adminRecordTitle("Event", load)).toEqual({ title: "Event" });
    mocks.getSession.mockResolvedValue({ user: { id: "o", role: "ORGANIZER", accountStatus: "ACTIVE" } });
    expect(await adminRecordTitle("Event", load)).toEqual({ title: "Event" });
    mocks.getSession.mockResolvedValue({ user: { id: "s", role: "ADMIN", accountStatus: "SUSPENDED" } });
    expect(await adminRecordTitle("Event", load)).toEqual({ title: "Event" });
    expect(load).not.toHaveBeenCalled();
  });

  it("gives a missing or blank record the same generic title", async () => {
    mocks.getSession.mockResolvedValue(admin);
    expect(await adminRecordTitle("Person", async () => null)).toEqual({ title: "Person" });
    expect(await adminRecordTitle("Person", async () => "   ")).toEqual({ title: "Person" });
  });
});

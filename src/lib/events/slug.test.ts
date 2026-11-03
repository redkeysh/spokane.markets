import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventFindUnique: vi.fn(),
  eventFindFirst: vi.fn(),
  redirectFindUnique: vi.fn(),
  redirectDeleteMany: vi.fn(),
  redirectCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    event: { findUnique: mocks.eventFindUnique, findFirst: mocks.eventFindFirst },
    eventSlugRedirect: {
      findUnique: mocks.redirectFindUnique,
      deleteMany: mocks.redirectDeleteMany,
      create: mocks.redirectCreate,
    },
  },
}));

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  EVENT_SLUG_PATTERN,
  eventSlugProblem,
  lockEventForSlugChange,
  recordEventSlugChange,
  resolveEventSlugRedirect,
  slugRedirectTarget,
} from "./slug";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventFindUnique.mockResolvedValue(null);
  mocks.redirectFindUnique.mockResolvedValue(null);
  mocks.eventFindFirst.mockResolvedValue(null);
});

describe("EVENT_SLUG_PATTERN", () => {
  it.each(["kendall-yards-christmas-market-2026-11-27", "cardcon", "a1-b2"])("accepts %s", (slug) => {
    expect(EVENT_SLUG_PATTERN.test(slug)).toBe(true);
  });

  it.each(["Kendall-Yards", "two  words", "double--hyphen", "-leading", "trailing-", "café", "a/b", "a?b", ""])(
    "rejects %j",
    (slug) => {
      expect(EVENT_SLUG_PATTERN.test(slug)).toBe(false);
    }
  );
});

describe("eventSlugProblem", () => {
  it("accepts a free, well-formed slug", async () => {
    expect(await eventSlugProblem("e1", "new-name")).toBeNull();
  });

  it("rejects an address that is not URL-safe without querying", async () => {
    expect(await eventSlugProblem("e1", "New Name!")).toMatch(/lowercase letters/);
    expect(mocks.eventFindUnique).not.toHaveBeenCalled();
  });

  it("rejects the slugs of sibling pages under /events", async () => {
    expect(await eventSlugProblem("e1", "calendar")).toMatch(/page of its own/);
    expect(await eventSlugProblem(null, "map")).toMatch(/page of its own/);
  });

  it("checks a new event's slug against every existing event", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "e2", title: "Fall Folk Festival", deletedAt: null });
    expect(await eventSlugProblem(null, "fall-folk-festival")).toMatch(/already uses/);
  });

  it("rejects a slug longer than the limit", async () => {
    expect(await eventSlugProblem("e1", "a".repeat(121))).toMatch(/up to 120/);
  });

  it("rejects a slug another event uses, archived ones included", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "e2", title: "Fall Folk Festival", deletedAt: new Date() });
    expect(await eventSlugProblem("e1", "fall-folk-festival")).toBe(
      '"Fall Folk Festival" (archived) already uses /events/fall-folk-festival.'
    );
  });

  it("allows the event's own current slug", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "e1", title: "Mine", deletedAt: null });
    expect(await eventSlugProblem("e1", "mine")).toBeNull();
  });

  it("rejects an old address that still redirects to another event", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ eventId: "e2", event: { title: "Rebel Junk Holiday Market" } });
    expect(await eventSlugProblem("e1", "rebel-junk")).toMatch(/used to belong to "Rebel Junk Holiday Market"/);
  });

  it("never names another event to public callers", async () => {
    mocks.eventFindUnique.mockResolvedValue({ id: "e2", title: "Secret Pop-Up", deletedAt: null });
    expect(await eventSlugProblem("e1", "secret-pop-up", { audience: "public" })).toBe(
      "/events/secret-pop-up is taken. Pick another slug."
    );
    mocks.eventFindUnique.mockResolvedValue(null);
    mocks.redirectFindUnique.mockResolvedValue({ eventId: "e2", event: { title: "Secret Pop-Up" } });
    expect(await eventSlugProblem("e1", "old-secret", { audience: "public" })).not.toContain("Secret");
  });

  it("lets an event take back one of its own old addresses", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ eventId: "e1", event: { title: "Mine" } });
    expect(await eventSlugProblem("e1", "old-mine")).toBeNull();
  });
});

describe("recordEventSlugChange", () => {
  it("points the public old slug at the event and drops a redirect the event takes back", async () => {
    expect(await recordEventSlugChange(db, "e1", "old-name", "new-name", { previousStatus: "PUBLISHED" })).toBe(true);
    expect(mocks.redirectDeleteMany).toHaveBeenCalledWith({ where: { slug: "new-name", eventId: "e1" } });
    expect(mocks.redirectCreate).toHaveBeenCalledWith({ data: { slug: "old-name", eventId: "e1" } });
  });

  it("keeps no redirect for an address that was never public", async () => {
    expect(await recordEventSlugChange(db, "e1", "old-name", "new-name", { previousStatus: "PENDING" })).toBe(false);
    expect(mocks.redirectDeleteMany).toHaveBeenCalled();
    expect(mocks.redirectCreate).not.toHaveBeenCalled();
  });

  it("leaves an old address that already redirects to another event alone", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ eventId: "e2" });
    expect(await recordEventSlugChange(db, "e1", "old-name", "new-name", { previousStatus: "PUBLISHED" })).toBe(false);
    expect(mocks.redirectCreate).not.toHaveBeenCalled();
  });

  it("does nothing when the slug did not change", async () => {
    expect(await recordEventSlugChange(db, "e1", "same", "same", { previousStatus: "PUBLISHED" })).toBe(false);
    expect(mocks.redirectCreate).not.toHaveBeenCalled();
    expect(mocks.redirectDeleteMany).not.toHaveBeenCalled();
  });
});

describe("lockEventForSlugChange", () => {
  it("reads the row's slug and status under a row lock", async () => {
    const queryRaw = vi.fn(async () => [{ slug: "current", status: "PUBLISHED" }]);
    const tx = { $queryRaw: queryRaw } as unknown as Prisma.TransactionClient;
    expect(await lockEventForSlugChange(tx, "e1")).toEqual({ slug: "current", status: "PUBLISHED" });
    expect((queryRaw.mock.calls[0] as unknown[])[0]).toEqual(expect.arrayContaining([expect.stringContaining("FOR UPDATE")]));
  });
});

describe("slugRedirectTarget", () => {
  it("returns the current slug even for an archived event", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ event: { slug: "spring-fair-2025" } });
    expect(await slugRedirectTarget("spring-fair")).toBe("spring-fair-2025");
  });
});

describe("resolveEventSlugRedirect", () => {
  it("returns the event's current slug", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ event: { slug: "new-name", deletedAt: null } });
    expect(await resolveEventSlugRedirect("old-name")).toBe("new-name");
  });

  it("does not reveal an unpublished event's address to public callers", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ event: { slug: "new-name", deletedAt: null, status: "PENDING" } });
    expect(await resolveEventSlugRedirect("old-name", { publishedOnly: true })).toBeNull();
    expect(await resolveEventSlugRedirect("old-name")).toBe("new-name");
  });

  it("yields to a live event that holds the old address now", async () => {
    mocks.redirectFindUnique.mockResolvedValue({ event: { slug: "new-name", deletedAt: null } });
    mocks.eventFindFirst.mockResolvedValue({ id: "e9" });
    expect(await resolveEventSlugRedirect("old-name")).toBeNull();
  });

  it("ignores redirects to archived events and unknown slugs", async () => {
    mocks.redirectFindUnique.mockResolvedValueOnce({ event: { slug: "new-name", deletedAt: new Date() } });
    expect(await resolveEventSlugRedirect("old-name")).toBeNull();
    expect(await resolveEventSlugRedirect("never-existed")).toBeNull();
  });
});

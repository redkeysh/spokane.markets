import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  venueFindMany: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { venue: { findMany: mocks.venueFindMany } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { GET } from "./route";

const venue = (id: string, name: string, address: string) => ({
  id,
  name,
  address,
  city: "Spokane",
  state: "WA",
  zip: "99201",
});

function get(q: string | null, ip = "203.0.113.7") {
  const url = new URL("https://spokane.markets/api/venues/suggest");
  if (q !== null) url.searchParams.set("q", q);
  return GET(new Request(url, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue({ ok: true, remaining: 59 });
  mocks.venueFindMany.mockResolvedValue([]);
});

describe("GET /api/venues/suggest", () => {
  it("searches active venues by every word and returns public fields only", async () => {
    mocks.venueFindMany.mockResolvedValue([
      venue("2", "Spokane County Fair & Expo Center", "404 N Havana St"),
      venue("1", "Expo Hall", "1 Main St"),
    ]);

    const res = await get("  expo ");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      venues: [venue("1", "Expo Hall", "1 Main St"), venue("2", "Spokane County Fair & Expo Center", "404 N Havana St")],
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("203.0.113.7", "venueSuggest");
    expect(mocks.venueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { name: { contains: "expo", mode: "insensitive" } },
                { address: { contains: "expo", mode: "insensitive" } },
              ],
            },
          ],
        },
        select: { id: true, name: true, address: true, city: true, state: true, zip: true },
      })
    );
  });

  it("matches multi-word queries word by word", async () => {
    await get("fair expo");
    const where = mocks.venueFindMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[1].OR[0]).toEqual({ name: { contains: "expo", mode: "insensitive" } });
  });

  it.each([null, "", "a", "  b  "])("returns nothing for the short query %o without a lookup", async (q) => {
    const res = await get(q);
    await expect(res.json()).resolves.toEqual({ venues: [] });
    expect(mocks.venueFindMany).not.toHaveBeenCalled();
  });

  it("rejects an overlong query", async () => {
    const res = await get("x".repeat(101));
    expect(res.status).toBe(400);
    expect(mocks.venueFindMany).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once the caller is rate limited", async () => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, remaining: 0, retryAfter: 30 });
    const res = await get("expo");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(mocks.venueFindMany).not.toHaveBeenCalled();
  });
});

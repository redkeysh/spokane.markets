import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  venueFindMany: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { venue: { findMany: mocks.venueFindMany } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { GET } from "./route";

type Where = { AND: Record<string, unknown>[] };

const venue = (id: string, name: string, address = "1 Main St") => ({
  id,
  name,
  address,
  city: "Spokane",
  state: "WA",
  zip: "99201",
});

const PUBLIC_VENUE = {
  deletedAt: null,
  OR: [
    { events: { some: { status: "PUBLISHED", deletedAt: null } } },
    { markets: { some: { deletedAt: null } } },
  ],
};

/** Answers the prefix query and the word query separately. */
function mockResults(prefix: ReturnType<typeof venue>[], words: ReturnType<typeof venue>[]) {
  mocks.venueFindMany.mockImplementation(async ({ where }: { where: Where }) =>
    where.AND.some((c) => "name" in c && "startsWith" in (c.name as object)) ? prefix : words
  );
}

function get(q: string | null, ip = "203.0.113.7") {
  const url = new URL("https://spokane.markets/api/venues/suggest");
  if (q !== null) url.searchParams.set("q", q);
  return GET(new Request(url, { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue({ ok: true, remaining: 59 });
  mockResults([], []);
});

describe("GET /api/venues/suggest", () => {
  it("searches only venues the public site shows, by every word, returning public fields", async () => {
    await get("fair expo");

    const select = { id: true, name: true, address: true, city: true, state: true, zip: true };
    expect(mocks.venueFindMany).toHaveBeenCalledWith({
      where: { AND: [PUBLIC_VENUE, { name: { startsWith: "fair expo", mode: "insensitive" } }] },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 6,
      select,
    });
    expect(mocks.venueFindMany).toHaveBeenCalledWith({
      where: {
        AND: [
          PUBLIC_VENUE,
          { OR: [{ name: { contains: "fair", mode: "insensitive" } }, { address: { contains: "fair", mode: "insensitive" } }] },
          { OR: [{ name: { contains: "expo", mode: "insensitive" } }, { address: { contains: "expo", mode: "insensitive" } }] },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 12,
      select,
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("203.0.113.7", "venueSuggest");
  });

  it("puts name-prefix matches first even when many other names sort before them", async () => {
    const stLuke = venue("st-luke", "St. Luke Lutheran Church");
    const others = Array.from({ length: 12 }, (_, i) => venue(`o${i}`, `A${i} Hall`, `${i} Stone St`));
    mockResults([stLuke], [...others.slice(0, 5), stLuke, ...others.slice(5)]);

    const res = await get("St");
    const { venues } = (await res.json()) as { venues: { id: string }[] };

    expect(venues.map((v) => v.id)).toEqual(["st-luke", "o0", "o1", "o2", "o3", "o4"]);
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

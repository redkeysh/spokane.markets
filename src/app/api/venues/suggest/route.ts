import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { SUGGEST_LIMIT, SUGGEST_MAX_QUERY, suggestQueryWords, type PublicVenue } from "@/lib/venues/suggest";

/** Venues the public site already shows: a published event or a market uses them. */
const PUBLIC_VENUE: Prisma.VenueWhereInput = {
  deletedAt: null,
  OR: [
    { events: { some: { status: "PUBLISHED", deletedAt: null } } },
    { markets: { some: { deletedAt: null } } },
  ],
};

const PUBLIC_FIELDS = { id: true, name: true, address: true, city: true, state: true, zip: true } as const;

/**
 * Public venues whose name or street address contains every word of ?q=,
 * case-insensitively, with public fields only. Names that start with the query
 * come first, then the rest, each alphabetical. Backs the submission form's
 * venue type-ahead.
 */
export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown";
  const { ok, retryAfter } = await checkRateLimit(ip, "venueSuggest");
  if (!ok) {
    const headers = retryAfter ? { "Retry-After": String(retryAfter) } : undefined;
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.length > SUGGEST_MAX_QUERY) {
    return NextResponse.json({ error: `Search text must be ${SUGGEST_MAX_QUERY} characters or fewer.` }, { status: 400 });
  }
  const words = suggestQueryWords(q);
  if (words.length === 0) return NextResponse.json({ venues: [] });

  try {
    // Every prefix match also contains each word, so taking twice the limit of
    // word matches leaves enough after the prefix matches are removed.
    const [prefixMatches, wordMatches] = await Promise.all([
      db.venue.findMany({
        where: { AND: [PUBLIC_VENUE, { name: { startsWith: q.trim(), mode: "insensitive" } }] },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: SUGGEST_LIMIT,
        select: PUBLIC_FIELDS,
      }),
      db.venue.findMany({
        where: {
          AND: [
            PUBLIC_VENUE,
            ...words.map((word) => ({
              OR: [
                { name: { contains: word, mode: "insensitive" as const } },
                { address: { contains: word, mode: "insensitive" as const } },
              ],
            })),
          ],
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: SUGGEST_LIMIT * 2,
        select: PUBLIC_FIELDS,
      }),
    ]);
    const prefixIds = new Set(prefixMatches.map((v) => v.id));
    const venues: PublicVenue[] = [...prefixMatches, ...wordMatches.filter((v) => !prefixIds.has(v.id))].slice(
      0,
      SUGGEST_LIMIT
    );
    return NextResponse.json({ venues }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (err) {
    console.error("Venue suggest API error:", err);
    return NextResponse.json({ error: "Couldn't load venue suggestions." }, { status: 500 });
  }
}

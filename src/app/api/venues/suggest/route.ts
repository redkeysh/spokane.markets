import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { rankVenueSuggestions, SUGGEST_MAX_QUERY, suggestQueryWords } from "@/lib/venues/suggest";

const CANDIDATE_LIMIT = 50;

/**
 * Active venues whose name or street address contains every word of ?q=,
 * case-insensitively, with public fields only. Backs the submission form's
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
    const venues = await db.venue.findMany({
      where: {
        deletedAt: null,
        AND: words.map((word) => ({
          OR: [
            { name: { contains: word, mode: "insensitive" as const } },
            { address: { contains: word, mode: "insensitive" as const } },
          ],
        })),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: CANDIDATE_LIMIT,
      select: { id: true, name: true, address: true, city: true, state: true, zip: true },
    });
    return NextResponse.json(
      { venues: rankVenueSuggestions(venues, q) },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    console.error("Venue suggest API error:", err);
    return NextResponse.json({ error: "Couldn't load venue suggestions." }, { status: 500 });
  }
}

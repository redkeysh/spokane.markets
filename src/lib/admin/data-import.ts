import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getNeighborhoodSlugSet } from "@/lib/neighborhoods";
import { slugify } from "@/lib/utils";
import { venueSchema } from "@/lib/validations";

type VenueRow = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  neighborhood?: string;
  parkingNotes?: string;
};

type MarketRow = {
  name: string;
  slug?: string;
  venueId?: string;
  venueSlug?: string;
  venueName?: string;
  description?: string;
  imageUrl?: string;
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  baseArea?: string;
  typicalSchedule?: string;
  contactEmail?: string;
  contactPhone?: string;
};

type EventRow = {
  title: string;
  slug?: string;
  description?: string;
  startDate: string;
  endDate: string;
  venueId?: string;
  venueSlug?: string;
  marketId?: string;
  marketSlug?: string;
  imageUrl?: string;
  status?: "DRAFT" | "PENDING" | "PUBLISHED" | "REJECTED" | "CANCELLED";
  websiteUrl?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  tagNames?: string[];
  featureNames?: string[];
  tagIds?: string[];
  featureIds?: string[];
};

export type ImportPayload = {
  venues?: VenueRow[];
  markets?: MarketRow[];
  events?: EventRow[];
};

export type ImportResult = {
  venuesCreated: number;
  marketsCreated: number;
  eventsCreated: number;
  errors: string[];
};

async function findOrCreateTag(
  client: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const slug = slugify(name) || "tag";
  let tag = await client.tag.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (!tag) {
    tag = await client.tag.create({
      data: { name, slug: slug || `tag-${Date.now()}` },
    });
  }
  return tag.id;
}

async function findOrCreateFeature(
  client: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const slug = slugify(name) || "feature";
  let feature = await client.feature.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (!feature) {
    feature = await client.feature.create({
      data: { name, slug: slug || `feature-${Date.now()}` },
    });
  }
  return feature.id;
}

export async function importData(payload: ImportPayload): Promise<ImportResult> {
  const result: ImportResult = {
    venuesCreated: 0,
    marketsCreated: 0,
    eventsCreated: 0,
    errors: [],
  };

  const venueIdBySlug = new Map<string, string>();
  const venueIdByName = new Map<string, string>();
  const marketIdBySlug = new Map<string, string>();
  const allowedNeighborhoods = await getNeighborhoodSlugSet();

  const normalizeNeighborhood = (
    value: string | undefined,
    field: "neighborhood" | "baseArea",
    rowLabel: string
  ): string | null => {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (!allowedNeighborhoods.has(trimmed)) {
      throw new Error(
        `${rowLabel}: invalid ${field} slug "${trimmed}". Create it in Admin → Neighborhoods first.`
      );
    }
    return trimmed;
  };

  // Pre-load existing venues and markets for resolution
  const [existingVenues, existingMarkets] = await Promise.all([
    db.venue.findMany({ select: { id: true, name: true } }),
    db.market.findMany({ select: { id: true, slug: true } }),
  ]);
  for (const v of existingVenues) {
    venueIdBySlug.set(slugify(v.name), v.id);
    venueIdByName.set(v.name, v.id);
  }
  for (const m of existingMarkets) {
    marketIdBySlug.set(m.slug, m.id);
  }

  // 1. Import venues
  if (payload.venues?.length) {
    for (let i = 0; i < payload.venues.length; i++) {
      try {
        const row = payload.venues[i];
        const parsed = venueSchema.safeParse(row);
        if (!parsed.success) {
          result.errors.push(`Venue ${i + 1}: ${parsed.error.message}`);
          continue;
        }
        const neighborhood = normalizeNeighborhood(
          parsed.data.neighborhood,
          "neighborhood",
          `Venue ${i + 1}`
        );
        const venue = await db.venue.create({
          data: {
            ...parsed.data,
            neighborhood,
            parkingNotes: parsed.data.parkingNotes || null,
          },
        });
        const vSlug = slugify(venue.name);
        if (vSlug) venueIdBySlug.set(vSlug, venue.id);
        venueIdByName.set(venue.name, venue.id);
        result.venuesCreated++;
      } catch (e) {
        result.errors.push(`Venue ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 2. Import markets
  if (payload.markets?.length) {
    for (let i = 0; i < payload.markets.length; i++) {
      try {
        const row = payload.markets[i];
        let venueId = row.venueId;
        if (!venueId && (row.venueSlug || row.venueName)) {
          venueId =
            (row.venueSlug && venueIdBySlug.get(row.venueSlug)) ??
            (row.venueName && venueIdByName.get(row.venueName)) ??
            (row.venueName && venueIdBySlug.get(slugify(row.venueName))) ??
            undefined;
        }
        if (!venueId) {
          result.errors.push(`Market ${i + 1} (${row.name}): venue not found`);
          continue;
        }
        const slug = row.slug || slugify(row.name) || `market-${Date.now()}-${i}`;
        // Create-only: skip a slug that already exists (a pre-existing market or
        // an earlier row in this batch) instead of silently overwriting it via
        // upsert and miscounting it as a new creation.
        if (marketIdBySlug.has(slug)) {
          result.errors.push(
            `Market ${i + 1} (${row.name}): slug "${slug}" already exists, skipped`
          );
          continue;
        }
        const baseArea = normalizeNeighborhood(
          row.baseArea,
          "baseArea",
          `Market ${i + 1} (${row.name})`
        );
        const market = await db.market.create({
          data: {
            name: row.name,
            slug,
            venueId,
            description: row.description || null,
            imageUrl: row.imageUrl || null,
            websiteUrl: row.websiteUrl || null,
            facebookUrl: row.facebookUrl || null,
            instagramUrl: row.instagramUrl || null,
            baseArea,
            typicalSchedule: row.typicalSchedule || null,
            contactEmail: row.contactEmail || null,
            contactPhone: row.contactPhone || null,
          },
        });
        marketIdBySlug.set(market.slug, market.id);
        result.marketsCreated++;
      } catch (e) {
        result.errors.push(`Market ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 3. Import events
  if (payload.events?.length) {
    for (let i = 0; i < payload.events.length; i++) {
      try {
        const row = payload.events[i];
        let venueId = row.venueId;
        if (!venueId && row.venueSlug) {
          venueId = venueIdBySlug.get(row.venueSlug) ?? undefined;
        }
        if (!venueId) {
          result.errors.push(`Event ${i + 1} (${row.title}): venue not found`);
          continue;
        }
        let marketId: string | null = row.marketId ?? null;
        if (!marketId && row.marketSlug) {
          marketId = marketIdBySlug.get(row.marketSlug) ?? null;
        }
        const slug = row.slug || slugify(row.title) || `event-${Date.now()}-${i}`;
        const startDate = new Date(row.startDate);
        const endDate = new Date(row.endDate);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          result.errors.push(`Event ${i + 1} (${row.title}): invalid dates`);
          continue;
        }
        // Create tags/features and the event in one transaction so a failed
        // event insert (e.g. a duplicate slug) rolls back any tags/features
        // created for it instead of leaving them orphaned.
        await db.$transaction(async (tx) => {
          const tagIds: string[] = [...(row.tagIds ?? [])];
          for (const name of row.tagNames ?? []) {
            tagIds.push(await findOrCreateTag(tx, name));
          }
          const featureIds: string[] = [...(row.featureIds ?? [])];
          for (const name of row.featureNames ?? []) {
            featureIds.push(await findOrCreateFeature(tx, name));
          }
          await tx.event.create({
            data: {
              title: row.title,
              slug,
              description: row.description || null,
              startDate,
              endDate,
              venueId,
              marketId,
              imageUrl: row.imageUrl || null,
              status: row.status ?? "DRAFT",
              websiteUrl: row.websiteUrl || null,
              facebookUrl: row.facebookUrl || null,
              instagramUrl: row.instagramUrl || null,
              tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
              features: featureIds.length ? { connect: featureIds.map((id) => ({ id })) } : undefined,
            },
          });
        });
        result.eventsCreated++;
      } catch (e) {
        result.errors.push(`Event ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return result;
}

/** Parse CSV text into venue rows. Expects header row. */
export function parseVenuesCsv(csvText: string): VenueRow[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: VenueRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    const lat = parseFloat(row.lat ?? row["lat"]);
    const lng = parseFloat(row.lng ?? row["lng"]);
    if (isNaN(lat) || isNaN(lng)) continue;
    rows.push({
      name: (row.name ?? "").trim(),
      address: (row.address ?? "").trim(),
      city: (row.city ?? "").trim(),
      state: (row.state ?? "").trim(),
      zip: (row.zip ?? "").trim(),
      lat,
      lng,
      neighborhood: (row.neighborhood ?? "").trim() || undefined,
      parkingNotes: (row.parkingnotes ?? row.parking_notes ?? "").trim() || undefined,
    });
  }
  return rows.filter((r) => r.name && r.address && r.city && r.state && r.zip);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // RFC 4180 escaped quote ("") inside a quoted field -> literal quote.
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((c === "," || c === "\n") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

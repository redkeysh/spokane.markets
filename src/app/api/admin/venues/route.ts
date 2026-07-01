import { db } from "@/lib/db";
import { assertNeighborhoodSlug } from "@/lib/neighborhoods";
import { venueSchema } from "@/lib/validations";
import { NextResponse } from "next/server";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  const { error } = await requireApiAdminPermission("admin.listings.manage");
  if (error) return error;

  const body = await request.json();
  const parsed = venueSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Validation failed", details: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  let neighborhood: string | null;
  try {
    neighborhood = await assertNeighborhoodSlug(
      parsed.data.neighborhood,
      "neighborhood"
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          message:
            err instanceof Error ? err.message : "Invalid neighborhood value",
        },
      },
      { status: 400 }
    );
  }

  let venue;
  try {
    venue = await db.venue.create({
    data: {
      ...parsed.data,
      neighborhood,
      parkingNotes: parsed.data.parkingNotes || null,
    },
    });
  } catch (e) {
    return handleApiError(e);
  }

  return NextResponse.json(venue, { status: 201 });
}

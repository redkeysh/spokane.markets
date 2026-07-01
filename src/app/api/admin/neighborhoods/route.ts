import { NextResponse } from "next/server";
import { requireApiAdmin, requireApiAdminPermission } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { neighborhoodSchema } from "@/lib/validations";

export async function GET() {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const neighborhoods = await db.neighborhood.findMany({
      orderBy: [{ label: "asc" }],
      include: {
        _count: {
          select: {
            markets: true,
            venues: true,
          },
        },
      },
    });
    return NextResponse.json(neighborhoods);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireApiAdminPermission("admin.settings.manage");
    if (error) return error;

    const body = await request.json();
    const parsed = neighborhoodSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const created = await db.neighborhood.create({
      data: {
        label: parsed.data.label,
        slug: parsed.data.slug,
        isActive: parsed.data.isActive,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

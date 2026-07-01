import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiValidationError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { promotionSchema } from "@/lib/validations";
import { parseAdminPagination } from "@/lib/admin/table-query";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parseAdminPagination({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    const skip = (page - 1) * limit;

    const [promotions, total] = await Promise.all([
      db.promotion.findMany({
        skip,
        take: limit,
        include: {
          event: {
            select: { id: true, title: true, slug: true, startDate: true },
          },
          vendorProfile: {
            select: { id: true, businessName: true, slug: true, imageUrl: true },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
      }),
      db.promotion.count(),
    ]);

    return NextResponse.json({
      promotions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("[GET /api/admin/promotions]", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const body = await request.json();
    const parsed = promotionSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    const promotion = await db.promotion.create({
      data: {
        eventId: data.eventId?.trim() ? data.eventId : null,
        vendorProfileId: data.vendorProfileId?.trim() ? data.vendorProfileId : null,
        type: data.type,
        sponsorName: data.sponsorName || null,
        imageUrl: data.imageUrl || null,
        linkUrl: data.linkUrl || null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        sortOrder: data.sortOrder ?? 0,
      },
      include: {
        event: {
          select: { id: true, title: true, slug: true, startDate: true },
        },
        vendorProfile: {
          select: { id: true, businessName: true, slug: true, imageUrl: true },
        },
      },
    });

    return NextResponse.json(promotion, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/promotions]", err);
    return apiError("Internal server error", 500);
  }
}

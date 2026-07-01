import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const communityBadgeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? slugify(v) : "")),
  description: z.string().optional().or(z.literal("")),
  icon: z.string().optional().or(z.literal("")),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

export async function GET() {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const badges = await db.badgeDefinition.findMany({
      where: { category: "LISTING_COMMUNITY" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { vendorProfiles: true, markets: true } },
      },
    });
    return NextResponse.json(badges);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const body = await request.json();
    const parsed = communityBadgeSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    const slug = data.slug || slugify(data.name);
    if (!slug) {
      return apiError("Unable to generate a valid slug", 400);
    }

    const created = await db.badgeDefinition.create({
      data: {
        name: data.name.trim(),
        slug,
        description: data.description?.trim() || null,
        icon: data.icon?.trim() || null,
        category: "LISTING_COMMUNITY",
        requiredRole: "GLOBAL",
        criteria: undefined,
        sortOrder: data.sortOrder ?? 100,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

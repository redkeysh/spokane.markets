import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { slugify } from "@/lib/utils";

const updateCommunityBadgeSchema = z.object({
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateCommunityBadgeSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    const slug = data.slug || slugify(data.name);
    if (!slug) {
      return apiError("Unable to generate a valid slug", 400);
    }

    // Only LISTING_COMMUNITY badges may be edited here (matches the DELETE
    // guard). Without this, this endpoint could overwrite auto-granted
    // achievement badge definitions.
    const existing = await db.badgeDefinition.findUnique({
      where: { id },
      select: { category: true },
    });
    if (!existing || existing.category !== "LISTING_COMMUNITY") {
      return apiError("Community badge not found", 404);
    }

    const updated = await db.badgeDefinition.update({
      where: { id },
      data: {
        name: data.name.trim(),
        slug,
        description: data.description?.trim() || null,
        icon: data.icon?.trim() || null,
        sortOrder: data.sortOrder ?? 100,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/admin/community-badges/:id]", err);
    return apiError("Internal server error", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    const existing = await db.badgeDefinition.findUnique({
      where: { id },
      select: { category: true },
    });
    if (!existing || existing.category !== "LISTING_COMMUNITY") {
      return apiError("Community badge not found", 404);
    }

    await db.badgeDefinition.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/admin/community-badges/:id]", err);
    return apiError("Internal server error", 500);
  }
}

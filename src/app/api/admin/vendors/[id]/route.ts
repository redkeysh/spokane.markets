import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { adminVendorProfileSchema } from "@/lib/validations";
import { parseGalleryUrlsFromMultilineText } from "@/lib/gallery-urls";
import { assertListingCommunityBadgeIds } from "@/lib/listing-community-badges";
import { extractSocialHandle, normalizeUrlToHttps, slugify } from "@/lib/utils";
import { NextResponse } from "next/server";

function toOptional(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  return value;
}

function toOptionalUrl(value: string | undefined): string | undefined {
  if (value === undefined || value === "") return undefined;
  return normalizeUrlToHttps(value);
}

function toOptionalHandle(
  value: string | undefined,
  platform: "facebook" | "instagram"
): string | undefined {
  if (value === undefined || value === "") return undefined;
  const handle = extractSocialHandle(value, platform);
  return handle ? handle : undefined;
}

async function generateUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const slug = slugify(base) || "vendor";
  const candidate_base = slug;
  let candidate = slug;
  let n = 0;
  while (true) {
    const existing = await db.vendorProfile.findFirst({
      where: { slug: candidate, deletedAt: null },
      select: { id: true },
    });
    if (!existing || (excludeId && existing.id === excludeId)) break;
    n += 1;
    candidate = `${candidate_base}-${n}`;
  }
  return candidate;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.listings.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = adminVendorProfileSchema.safeParse(body);

    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const data = parsed.data;
    let listingCommunityBadgeIds: string[] | undefined;
    if (data.listingCommunityBadgeIds !== undefined) {
      try {
        listingCommunityBadgeIds = await assertListingCommunityBadgeIds(
          data.listingCommunityBadgeIds
        );
      } catch (err) {
        return apiError(
          err instanceof Error ? err.message : "Invalid community badges",
          400
        );
      }
    }
    let slug = data.slug;

    if (slug) {
      const existing = await db.vendorProfile.findFirst({
        where: { slug, deletedAt: null },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        return apiError(`Slug "${slug}" is already taken.`, 400);
      }
    } else {
      const current = await db.vendorProfile.findFirst({
        where: { id, deletedAt: null },
        select: { businessName: true },
      });
      slug = current
        ? await generateUniqueSlug(current.businessName, id)
        : await generateUniqueSlug(data.businessName, id);
    }

    const galleryUrls =
      data.galleryUrls ??
      (data.galleryUrlsText !== undefined
        ? parseGalleryUrlsFromMultilineText(data.galleryUrlsText)
        : undefined);

    const existingVendor = await db.vendorProfile.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!existingVendor) {
      return apiError("Vendor not found or archived", 404);
    }

    const vendor = await db.vendorProfile.update({
      where: { id },
      data: {
        businessName: data.businessName,
        slug,
        description: toOptional(data.description),
        imageUrl: toOptional(data.imageUrl),
        ...(data.imageFocalX != null && { imageFocalX: data.imageFocalX }),
        ...(data.imageFocalY != null && { imageFocalY: data.imageFocalY }),
        heroImageUrl: toOptional(data.heroImageUrl),
        ...(data.heroImageFocalX != null && { heroImageFocalX: data.heroImageFocalX }),
        ...(data.heroImageFocalY != null && { heroImageFocalY: data.heroImageFocalY }),
        primaryCategory: toOptional(data.primaryCategory),
        serviceAreaLabel: toOptional(data.serviceAreaLabel),
        websiteUrl: toOptionalUrl(data.websiteUrl),
        facebookUrl: toOptionalHandle(data.facebookUrl, "facebook"),
        instagramUrl: toOptionalHandle(data.instagramUrl, "instagram"),
        contactEmail: toOptional(data.contactEmail),
        contactPhone: toOptional(data.contactPhone),
        ...(Array.isArray(galleryUrls) && { galleryUrls }),
        specialties: toOptional(data.specialties),
        userId:
          data.userId && typeof data.userId === "string" && data.userId.trim()
            ? data.userId.trim()
            : null,
        contactVisible: data.contactVisible ?? false,
        socialLinksVisible: data.socialLinksVisible ?? false,
        ...(data.verificationStatus !== undefined && {
          verificationStatus: data.verificationStatus,
        }),
        ...(listingCommunityBadgeIds !== undefined && {
          listingCommunityBadges: {
            set: listingCommunityBadgeIds.map((badgeId) => ({ id: badgeId })),
          },
        }),
      },
    });

    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
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
    await db.vendorProfile.update({ where: { id }, data: { deletedAt: new Date() } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleApiError(err);
  }
}

import { z } from "zod";
import type { VerificationStatus } from "@prisma/client";
import { GALLERY_URL_MAX, isAllowedGalleryImageUrl } from "@/lib/gallery-urls";
import { MAX_LISTING_COMMUNITY_BADGES } from "@/lib/listing-community-badge-constants";
import { flexibleUrlSchema, imageFocalSchema, imageUrlSchema } from "@/lib/validations/common";
import { extractSocialHandle, normalizeUrlToHttps } from "@/lib/utils";
import type { VendorVerificationRequirementCode } from "@/lib/vendor-verification";

/** What the vendor page saves. The same rules as the vendor API, worded for the owner. */
export const vendorEditorSchema = z.object({
  businessName: z.string().trim().min(1, "Add the business name.").max(200, "Keep the name under 200 characters."),
  slug: z
    .string()
    .trim()
    .max(120, "Keep the web address under 120 characters.")
    .refine((v) => !v || /^[a-z0-9-]+$/.test(v), "Use lowercase letters, numbers and hyphens only."),
  description: z.string().max(20000),
  specialties: z.string().max(2000),
  primaryCategory: z.string().trim().max(120, "Keep the category under 120 characters."),
  serviceAreaLabel: z.string().trim().max(200, "Keep the service area under 200 characters."),
  contactEmail: z
    .string()
    .trim()
    .refine((v) => !v || z.email().safeParse(v).success, "This email address looks incomplete."),
  contactPhone: z.string().trim().max(40),
  contactVisible: z.boolean(),
  socialLinksVisible: z.boolean(),
  imageUrl: imageUrlSchema,
  imageFocalX: imageFocalSchema,
  imageFocalY: imageFocalSchema,
  heroImageUrl: imageUrlSchema,
  heroImageFocalX: imageFocalSchema,
  heroImageFocalY: imageFocalSchema,
  galleryUrls: z
    .array(z.string().refine(isAllowedGalleryImageUrl, "Gallery pictures must be uploads or web links."))
    .max(GALLERY_URL_MAX, `The gallery holds up to ${GALLERY_URL_MAX} pictures.`),
  websiteUrl: flexibleUrlSchema,
  facebookUrl: z.string().trim().max(300),
  instagramUrl: z.string().trim().max(300),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED"]),
  userId: z.string().trim().min(1).nullable(),
  listingCommunityBadgeIds: z
    .array(z.string().min(1))
    .max(MAX_LISTING_COMMUNITY_BADGES, `Pick at most ${MAX_LISTING_COMMUNITY_BADGES} community badges.`),
});

export type VendorEditorInput = z.infer<typeof vendorEditorSchema>;

export const EMPTY_VENDOR: VendorEditorInput = {
  businessName: "",
  slug: "",
  description: "",
  specialties: "",
  primaryCategory: "",
  serviceAreaLabel: "",
  contactEmail: "",
  contactPhone: "",
  contactVisible: false,
  socialLinksVisible: false,
  imageUrl: "",
  imageFocalX: 50,
  imageFocalY: 50,
  heroImageUrl: "",
  heroImageFocalX: 50,
  heroImageFocalY: 50,
  galleryUrls: [],
  websiteUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  verificationStatus: "UNVERIFIED",
  userId: null,
  listingCommunityBadgeIds: [],
};

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The columns a save writes, without the web address, owner and badges (they need lookups).
 * A cleared field is written as null, so emptying a field on the page empties it on the site.
 * Websites gain https://; Facebook and Instagram links are stored as handles.
 */
export function vendorWriteData(input: VendorEditorInput) {
  const website = textOrNull(input.websiteUrl);
  const facebook = textOrNull(input.facebookUrl);
  const instagram = textOrNull(input.instagramUrl);
  return {
    businessName: input.businessName.trim(),
    description: textOrNull(input.description),
    specialties: textOrNull(input.specialties),
    primaryCategory: textOrNull(input.primaryCategory),
    serviceAreaLabel: textOrNull(input.serviceAreaLabel),
    contactEmail: textOrNull(input.contactEmail),
    contactPhone: textOrNull(input.contactPhone),
    contactVisible: input.contactVisible,
    socialLinksVisible: input.socialLinksVisible,
    imageUrl: textOrNull(input.imageUrl),
    imageFocalX: input.imageFocalX ?? 50,
    imageFocalY: input.imageFocalY ?? 50,
    heroImageUrl: textOrNull(input.heroImageUrl),
    heroImageFocalX: input.heroImageFocalX ?? 50,
    heroImageFocalY: input.heroImageFocalY ?? 50,
    galleryUrls: input.galleryUrls.map((url) => url.trim()).filter(Boolean),
    websiteUrl: website ? normalizeUrlToHttps(website) : null,
    facebookUrl: facebook ? textOrNull(extractSocialHandle(facebook, "facebook")) : null,
    instagramUrl: instagram ? textOrNull(extractSocialHandle(instagram, "instagram")) : null,
    verificationStatus: input.verificationStatus,
  };
}

/** The first error message for each field, keyed by field name. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export const VERIFICATION_OPTIONS: ReadonlyArray<{ value: VerificationStatus; label: string; description: string }> = [
  {
    value: "VERIFIED",
    label: "Verified",
    description: "Shows a verified badge on their profile and listings. The owner is told, if someone claimed the profile.",
  },
  { value: "PENDING", label: "Waiting for verification", description: "They asked to be verified. No badge yet." },
  { value: "UNVERIFIED", label: "Not verified", description: "No badge." },
];

export type VerificationCheck = { label: string; met: boolean; detail?: string };

const CHECK_LABELS: ReadonlyArray<readonly [VendorVerificationRequirementCode, string]> = [
  ["EMAIL_NOT_VERIFIED", "The owner confirmed their account email"],
  ["PROFILE_COMPLETION_BELOW_MINIMUM", "The profile is at least 80% filled in"],
  ["MISSING_BUSINESS_NAME", "Business name"],
  ["MISSING_DESCRIPTION", "Description"],
  ["MISSING_IMAGE_URL", "Profile picture"],
  ["MISSING_CONTACT_METHOD", "An email address or phone number"],
  ["MISSING_DISCOVERABILITY_LINK", "A website, Facebook or Instagram link"],
  ["MISSING_SPECIALTIES", "Specialties"],
];

/**
 * The verification rules of src/lib/vendor-verification.ts as a checklist about the vendor.
 * Without an owner account there is no email to confirm, so that line is unmet and says why.
 */
export function verificationChecklist(
  readiness: { profileCompletionPercent: number; unmetRequirements: ReadonlyArray<{ code: string }> },
  { claimed }: { claimed: boolean }
): VerificationCheck[] {
  const unmet = new Set(readiness.unmetRequirements.map((r) => r.code));
  return CHECK_LABELS.map(([code, label]) => {
    if (code === "EMAIL_NOT_VERIFIED" && !claimed) {
      return { label, met: false, detail: "Nobody has claimed this profile yet." };
    }
    if (code === "PROFILE_COMPLETION_BELOW_MINIMUM") {
      return { label, met: !unmet.has(code), detail: `Now ${readiness.profileCompletionPercent}%.` };
    }
    return { label, met: !unmet.has(code) };
  });
}

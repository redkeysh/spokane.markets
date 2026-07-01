"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  adminVendorProfileSchema,
  type AdminVendorProfileInput,
} from "@/lib/validations";
import { parseGalleryUrlsFromMultilineText } from "@/lib/gallery-urls";
import { slugify } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import {
  AdminStickyActionBar,
  AdminTwoColumnFormLayout,
} from "@/components/admin/admin-form-layout";
import {
  UserSearchSelect,
  type UserOption,
} from "@/components/admin/user-search-select";
import type { ListingCommunityBadgeOption } from "@/lib/listing-community-badges";

interface AdminVendorFormProps {
  initialData?: AdminVendorProfileInput & {
    id: string;
    user?: UserOption | null;
  };
  listingCommunityBadgeOptions: ListingCommunityBadgeOption[];
}

export function AdminVendorForm({
  initialData,
  listingCommunityBadgeOptions,
}: AdminVendorFormProps) {
  const router = useRouter();
  const [serverError, setServerError] = React.useState<string | null>(null);
  const isEditing = !!initialData?.id;

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AdminVendorProfileInput>({
    resolver: zodResolver(adminVendorProfileSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          verificationStatus: initialData.verificationStatus ?? "UNVERIFIED",
          imageFocalX: initialData.imageFocalX ?? 50,
          imageFocalY: initialData.imageFocalY ?? 50,
          heroImageFocalX: initialData.heroImageFocalX ?? 50,
          heroImageFocalY: initialData.heroImageFocalY ?? 50,
          listingCommunityBadgeIds:
            initialData.listingCommunityBadgeIds ?? [],
        }
      : {
          businessName: "",
          slug: "",
          description: "",
          imageUrl: "",
          heroImageUrl: "",
          heroImageFocalX: 50,
          heroImageFocalY: 50,
          primaryCategory: "",
          serviceAreaLabel: "",
          websiteUrl: "",
          facebookUrl: "",
          instagramUrl: "",
          contactEmail: "",
          contactPhone: "",
          galleryUrlsText: "",
          specialties: "",
          userId: null,
          contactVisible: false,
          socialLinksVisible: false,
          verificationStatus: "UNVERIFIED",
          listingCommunityBadgeIds: [],
        },
  });

  const businessName = useWatch({ control, name: "businessName" });
  const slugValue = useWatch({ control, name: "slug" });
  const userId = useWatch({ control, name: "userId" });
  const imageUrl = useWatch({ control, name: "imageUrl" });
  const heroImageUrl = useWatch({ control, name: "heroImageUrl" });
  const contactVisible = useWatch({ control, name: "contactVisible" });
  const socialLinksVisible = useWatch({ control, name: "socialLinksVisible" });
  const suggestedSlug = slugify(businessName ?? "") || "vendor";

  const handleSlugFromName = () => {
    if (!slugValue && businessName) {
      setValue("slug", suggestedSlug);
    }
  };

  async function onSubmit(data: AdminVendorProfileInput) {
    setServerError(null);

    const payload: Record<string, unknown> = { ...data };
    const text = (payload.galleryUrlsText as string) ?? "";
    payload.galleryUrls = parseGalleryUrlsFromMultilineText(text);
    delete payload.galleryUrlsText;

    const url = isEditing
      ? `/api/admin/vendors/${initialData!.id}`
      : "/api/admin/vendors";
    const method = isEditing ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setServerError(getApiErrorMessage(body, "Something went wrong"));
      return;
    }

    router.push("/admin/vendors");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-24">
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? "Edit Vendor Profile" : "Create Vendor Profile"}
          </CardTitle>
          <CardDescription>
            {isEditing
              ? "Update vendor profile. Slug changes affect the public URL."
              : "Create a new vendor profile. Leave slug empty to auto-generate from business name."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {serverError && (
            <div className="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}
          <AdminTwoColumnFormLayout
            main={
              <>
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input
                    id="businessName"
                    placeholder="e.g. Sunshine Farm Produce"
                    {...register("businessName")}
                  />
                  {errors.businessName && (
                    <p className="text-sm text-destructive">
                      {errors.businessName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <div className="flex gap-2">
                    <Input
                      id="slug"
                      placeholder={suggestedSlug}
                      {...register("slug")}
                      className="font-mono"
                    />
                    {!isEditing && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSlugFromName}
                      >
                        From name
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    URL path: /vendors/[slug]. Lowercase letters, numbers, hyphens only.
                    Leave empty to auto-generate.
                  </p>
                  {errors.slug && (
                    <p className="text-sm text-destructive">{errors.slug.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Official vendor (user account)</Label>
                  <UserSearchSelect
                    value={userId ?? null}
                    onChange={(id) => setValue("userId", id)}
                    allowVendorId={initialData?.id}
                    initialUser={initialData?.user ?? null}
                    placeholder="Search by name or email..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Tell customers what you sell..."
                    rows={4}
                    {...register("description")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="specialties">Specialties</Label>
                  <Textarea
                    id="specialties"
                    placeholder="e.g. Organic vegetables, artisan bread"
                    rows={2}
                    {...register("specialties")}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="primaryCategory">Primary category</Label>
                    <Input id="primaryCategory" {...register("primaryCategory")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serviceAreaLabel">Service area</Label>
                    <Input id="serviceAreaLabel" {...register("serviceAreaLabel")} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={contactVisible ?? false}
                      onChange={(e) => setValue("contactVisible", e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">Contact info visible</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={socialLinksVisible ?? false}
                      onChange={(e) => setValue("socialLinksVisible", e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">Social links visible</span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="contact@example.com"
                      {...register("contactEmail")}
                    />
                    {errors.contactEmail && (
                      <p className="text-sm text-destructive">
                        {errors.contactEmail.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <PhoneInput id="contactPhone" {...register("contactPhone")} />
                    {errors.contactPhone && (
                      <p className="text-sm text-destructive">
                        {errors.contactPhone.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="galleryUrlsText">Gallery Images</Label>
                  <Textarea
                    id="galleryUrlsText"
                    placeholder="One image URL per line (/uploads/... or https://...)"
                    rows={3}
                    {...register("galleryUrlsText")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Site uploads use paths starting with /uploads/ — these are preserved when you save.
                  </p>
                </div>
              </>
            }
            aside={
              <>
                <div className="space-y-2">
                  <Label htmlFor="verificationStatus">Verification status</Label>
                  <select
                    id="verificationStatus"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    {...register("verificationStatus")}
                  >
                    <option value="UNVERIFIED">Unverified</option>
                    <option value="PENDING">Pending</option>
                    <option value="VERIFIED">Verified</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Verified vendors display a public badge on listings and their profile.
                  </p>
                </div>

                <ImageUploadWithUrl
                  value={imageUrl ?? ""}
                  onChange={(url) => setValue("imageUrl", url)}
                  uploadType="vendor"
                  disabled={isSubmitting}
                  label="Profile image"
                  aspectRatio="square"
                />
                {errors.imageUrl && (
                  <p className="text-sm text-destructive">{errors.imageUrl.message}</p>
                )}

                <div className="space-y-2">
                  <Label>Cover image (optional)</Label>
                  <ImageUploadWithUrl
                    value={heroImageUrl ?? ""}
                    onChange={(url) => setValue("heroImageUrl", url)}
                    uploadType="vendor"
                    disabled={isSubmitting}
                    label="Cover image"
                    aspectRatio="banner"
                  />
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Community trust badges
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Self-identified badges shown on public vendor profiles.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {listingCommunityBadgeOptions.map((badge) => (
                      <label
                        key={badge.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-background/80 px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          value={badge.id}
                          className="mt-0.5 rounded border-border"
                          {...register("listingCommunityBadgeIds")}
                        />
                        <span className="text-sm">{badge.name}</span>
                      </label>
                    ))}
                  </div>
                  {listingCommunityBadgeOptions.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No community badges exist yet. Add them in `/admin/badges`.
                    </p>
                  )}
                  {errors.listingCommunityBadgeIds && (
                    <p className="mt-2 text-sm text-destructive">
                      {errors.listingCommunityBadgeIds.message as string}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="websiteUrl">Website</Label>
                    <Input
                      id="websiteUrl"
                      type="text"
                      placeholder="www.example.com or https://..."
                      {...register("websiteUrl")}
                    />
                    {errors.websiteUrl && (
                      <p className="text-sm text-destructive">
                        {errors.websiteUrl.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="facebookUrl">Facebook username</Label>
                    <Input
                      id="facebookUrl"
                      type="text"
                      placeholder="username"
                      {...register("facebookUrl")}
                    />
                    {errors.facebookUrl && (
                      <p className="text-sm text-destructive">
                        {errors.facebookUrl.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instagramUrl">Instagram username</Label>
                    <Input
                      id="instagramUrl"
                      type="text"
                      placeholder="username"
                      {...register("instagramUrl")}
                    />
                    {errors.instagramUrl && (
                      <p className="text-sm text-destructive">
                        {errors.instagramUrl.message}
                      </p>
                    )}
                  </div>
                </div>
              </>
            }
          />
        </CardContent>
      </Card>

      <AdminStickyActionBar>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving..."
              : isEditing
                ? "Update Profile"
                : "Create Profile"}
          </Button>
        </div>
      </AdminStickyActionBar>
    </form>
  );
}

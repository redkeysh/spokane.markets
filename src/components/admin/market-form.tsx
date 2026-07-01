"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { marketSchema, type MarketInput } from "@/lib/validations";
import { slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { UserSearchInput } from "@/components/admin/user-search-input";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import {
  AdminStickyActionBar,
  AdminTwoColumnFormLayout,
} from "@/components/admin/admin-form-layout";
import type { NeighborhoodOption } from "@/lib/neighborhoods-config";
import type { ListingCommunityBadgeOption } from "@/lib/listing-community-badges";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";

interface MarketFormProps {
  initialData?: MarketInput & { id: string };
  venues: Array<{ id: string; name: string }>;
  neighborhoods: NeighborhoodOption[];
  users?: Array<{ id: string; name: string | null; email: string }>;
  ownerDisplay?: string;
  listingCommunityBadgeOptions: ListingCommunityBadgeOption[];
}

export function MarketForm({
  initialData,
  venues,
  neighborhoods,
  users: _users = [],
  ownerDisplay,
  listingCommunityBadgeOptions,
}: MarketFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<MarketInput>({
    resolver: zodResolver(marketSchema) as Resolver<MarketInput>,
    defaultValues: initialData
      ? {
          ...initialData,
          imageFocalX: initialData.imageFocalX ?? 50,
          imageFocalY: initialData.imageFocalY ?? 50,
          listingCommunityBadgeIds:
            initialData.listingCommunityBadgeIds ?? [],
        }
      : {
      name: "",
      slug: "",
      venueId: "",
      description: "",
      imageUrl: "",
      websiteUrl: "",
      facebookUrl: "",
      instagramUrl: "",
      baseArea: "",
      typicalSchedule: "",
      contactEmail: "",
      contactPhone: "",
      verificationStatus: "UNVERIFIED",
      ownerId: "",
      participationMode: "OPEN",
      vendorCapacity: null,
      publicIntentListEnabled: true,
      publicIntentNamesEnabled: true,
      publicRosterEnabled: true,
      imageFocalX: 50,
      imageFocalY: 50,
      listingCommunityBadgeIds: [],
    },
  });

  const watchName = watch("name");
  const watchImageUrl = watch("imageUrl");

  const autoSlug = () => {
    setValue("slug", slugify(watchName));
  };

  const onSubmit = async (data: MarketInput) => {
    setSubmitting(true);
    setError(null);

    try {
      const url = initialData
        ? `/api/admin/markets/${initialData.id}`
        : "/api/admin/markets";
      const method = initialData ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to save market");
      }

      toast.success(initialData ? "Market updated." : "Market created.");
      router.push("/admin/markets");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-24">
      {error && (
        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <AdminTwoColumnFormLayout
        main={
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <div className="flex gap-2">
                <Input id="slug" {...register("slug")} className="flex-1" />
                <Button type="button" variant="outline" onClick={autoSlug}>
                  Auto
                </Button>
              </div>
              {errors.slug && (
                <p className="text-sm text-destructive">{errors.slug.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="venueId">Venue</Label>
              <Select id="venueId" {...register("venueId")}>
                <option value="">Select a venue...</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
              {errors.venueId && (
                <p className="text-sm text-destructive">{errors.venueId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={4} {...register("description")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseArea">Neighborhood</Label>
              <Select id="baseArea" {...register("baseArea")}>
                <option value="">Select neighborhood…</option>
                {neighborhoods.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="typicalSchedule">Typical Schedule</Label>
              <Input
                id="typicalSchedule"
                placeholder="e.g. Every Saturday, May-October"
                {...register("typicalSchedule")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input id="contactEmail" type="email" {...register("contactEmail")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact Phone</Label>
                <PhoneInput id="contactPhone" {...register("contactPhone")} />
              </div>
            </div>

            {initialData && (
              <>
                <UserSearchInput
                  value={watch("ownerId") ?? ""}
                  displayValue={ownerDisplay}
                  onChange={(userId) => setValue("ownerId", userId)}
                  label="Owner (optional)"
                  placeholder="Search by name or email..."
                />
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <h3 className="font-semibold">Vendor participation</h3>
                  <div className="space-y-2">
                    <Label htmlFor="participationMode">Participation mode</Label>
                    <Select id="participationMode" {...register("participationMode")}>
                      <option value="OPEN">Mark as attending</option>
                      <option value="REQUEST_TO_JOIN">Request to join</option>
                      <option value="INVITE_ONLY">Invite only / Juried</option>
                      <option value="CAPACITY_LIMITED">
                        Request to join (capacity limited)
                      </option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorCapacity">Vendor capacity</Label>
                    <Input
                      id="vendorCapacity"
                      type="number"
                      min={0}
                      placeholder="Optional"
                      {...register("vendorCapacity", {
                        setValueAs: (v) =>
                          v === "" || v === undefined || Number.isNaN(Number(v))
                            ? null
                            : Number(v),
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Only meaningful for capacity-limited mode. Leave empty for others.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...register("publicIntentListEnabled")} />
                      <span className="text-sm">Show self-reported vendors list</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...register("publicIntentNamesEnabled")} />
                      <span className="text-sm">
                        Show self-reported vendor names (vs counts only)
                      </span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...register("publicRosterEnabled")} />
                      <span className="text-sm">Show official roster</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorWorkflowMode">Vendor workflow mode</Label>
                    <Select id="vendorWorkflowMode" {...register("vendorWorkflowMode")}>
                      <option value="">Default</option>
                      <option value="INTENT_ONLY">Intent only</option>
                      <option value="BOTH">
                        Both (intent + application when applicable)
                      </option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vendorApplicationState">
                      Vendor application state
                    </Label>
                    <Select
                      id="vendorApplicationState"
                      {...register("vendorApplicationState")}
                    >
                      <option value="NOT_ACCEPTING">Not accepting</option>
                      <option value="OPEN">Open</option>
                      <option value="WAITLIST">Waitlist</option>
                      <option value="CLOSED">Closed</option>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </>
        }
        aside={
          <>
            <ImageUploadWithUrl
              value={watchImageUrl ?? ""}
              onChange={(url) => setValue("imageUrl", url)}
              uploadType="market"
              label="Market image"
              aspectRatio="banner"
            />
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website URL</Label>
                <Input id="websiteUrl" type="url" {...register("websiteUrl")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebookUrl">Facebook URL</Label>
                <Input id="facebookUrl" type="url" {...register("facebookUrl")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instagramUrl">Instagram URL</Label>
                <Input id="instagramUrl" type="url" {...register("instagramUrl")} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">
                Community trust badges
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Self-identified badges for inclusion and representation.
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

            {initialData && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="verificationStatus">Verification Status</Label>
                  <Select id="verificationStatus" {...register("verificationStatus")}>
                    <option value="UNVERIFIED">Unverified</option>
                    <option value="PENDING">Pending</option>
                    <option value="VERIFIED">Verified</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Verified markets can have their events auto-published by their
                    owner.
                  </p>
                </div>
                <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" {...register("complianceFlagged")} />
                    <span className="text-sm font-medium">
                      Flag for compliance review
                    </span>
                  </label>
                  <Label htmlFor="complianceNotes">
                    Compliance / moderation notes (internal)
                  </Label>
                  <Textarea id="complianceNotes" rows={3} {...register("complianceNotes")} />
                </div>
              </>
            )}
          </>
        }
      />

      <AdminStickyActionBar>
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : initialData
                ? "Update Market"
                : "Create Market"}
          </Button>
        </div>
      </AdminStickyActionBar>
    </form>
  );
}

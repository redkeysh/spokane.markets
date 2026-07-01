"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { promotionSchema, type PromotionInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import {
  AdminStickyActionBar,
  AdminTwoColumnFormLayout,
} from "@/components/admin/admin-form-layout";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useState } from "react";

interface PromotionFormProps {
  events: Array<{ id: string; title: string; slug: string; startDate: Date }>;
  vendors: Array<{ id: string; businessName: string; slug: string }>;
  initialData?: Partial<PromotionInput> & { id: string };
}

function toDateInputValue(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function PromotionForm({ events, vendors, initialData }: PromotionFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"event" | "vendor">(
    initialData && "vendorProfileId" in initialData && initialData.vendorProfileId ? "vendor" : "event"
  );

  const getDateValue = (d: string | Date | undefined): string => {
    if (!d) return "";
    if (typeof d === "string") return d.slice(0, 10);
    return toDateInputValue(d);
  };

  const defaultValues: Partial<PromotionInput> = initialData
    ? {
        eventId: (initialData as { eventId?: string }).eventId ?? "",
        vendorProfileId: (initialData as { vendorProfileId?: string }).vendorProfileId ?? "",
        type: (initialData as { type?: PromotionInput["type"] }).type ?? "FEATURED",
        sponsorName: (initialData as { sponsorName?: string | null }).sponsorName ?? "",
        imageUrl: (initialData as { imageUrl?: string }).imageUrl ?? "",
        linkUrl: (initialData as { linkUrl?: string }).linkUrl ?? "",
        startDate: getDateValue((initialData as { startDate?: string | Date }).startDate),
        endDate: getDateValue((initialData as { endDate?: string | Date }).endDate),
        sortOrder: (initialData as { sortOrder?: number }).sortOrder ?? 0,
      }
    : {
        eventId: "",
        vendorProfileId: "",
        type: "FEATURED",
        sponsorName: "",
        imageUrl: "",
        linkUrl: "",
        startDate: "",
        endDate: "",
        sortOrder: 0,
      };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    defaultValues: defaultValues as PromotionInput,
  });

  useEffect(() => {
    if (targetType === "event") {
      setValue("vendorProfileId", "", { shouldDirty: true, shouldValidate: false });
    } else {
      setValue("eventId", "", { shouldDirty: true, shouldValidate: false });
    }
  }, [targetType, setValue]);

  const onSubmit = async (data: PromotionInput) => {
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        ...data,
        eventId: targetType === "event" ? (data.eventId ?? "") : "",
        vendorProfileId: targetType === "vendor" ? (data.vendorProfileId ?? "") : "",
      };
      if ("startDate" in payload && payload.startDate) {
        payload.startDate = `${payload.startDate}T00:00:00.000Z`;
      }
      if ("endDate" in payload && payload.endDate) {
        payload.endDate = `${payload.endDate}T23:59:59.999Z`;
      }

      const url = initialData
        ? `/api/admin/promotions/${initialData.id}`
        : "/api/admin/promotions";
      const method = initialData ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to save promotion");
      }

      toast.success(initialData ? "Promotion updated." : "Promotion created.");
      router.push("/admin/promotions");
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
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <AdminTwoColumnFormLayout
        main={
          <>
            <div className="space-y-2">
              <Label htmlFor="targetType">Promotion target</Label>
              <Select
                id="targetType"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as "event" | "vendor")}
              >
                <option value="event">Event</option>
                <option value="vendor">Vendor</option>
              </Select>
            </div>

            {targetType === "event" ? (
              <div className="space-y-2">
                <Label htmlFor="eventId">Event</Label>
                <Select id="eventId" {...register("eventId")} required={!initialData}>
                  <option value="">Select an event</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} ({toDateInputValue(e.startDate)})
                    </option>
                  ))}
                </Select>
                {errors.eventId && (
                  <p className="text-sm text-destructive">
                    {(errors.eventId as { message?: string }).message}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="vendorProfileId">Vendor</Label>
                <Select
                  id="vendorProfileId"
                  {...register("vendorProfileId")}
                  required={!initialData}
                >
                  <option value="">Select a vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.businessName}
                    </option>
                  ))}
                </Select>
                {errors.eventId && (
                  <p className="text-sm text-destructive">
                    {(errors.eventId as { message?: string }).message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select id="type" {...register("type")}>
                <option value="SPONSORED">Sponsored</option>
                <option value="PARTNERSHIP">Partner Spotlight</option>
                <option value="FEATURED">Featured</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sponsorName">Sponsor Name (optional)</Label>
              <Input
                id="sponsorName"
                {...register("sponsorName")}
                placeholder="e.g. Local Business Inc."
              />
            </div>
          </>
        }
        aside={
          <>
            <ImageUploadWithUrl
              value={watch("imageUrl") ?? ""}
              onChange={(url) => setValue("imageUrl", url)}
              uploadType="banner"
              label="Promotion image"
              aspectRatio="banner"
            />

            <div className="space-y-2">
              <Label htmlFor="linkUrl">Link</Label>
              <Input
                id="linkUrl"
                type="url"
                placeholder="https://..."
                {...register("linkUrl")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <DatePickerInput
                id="startDate"
                value={watch("startDate")}
                onChange={(value) =>
                  setValue("startDate", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              {errors.startDate && (
                <p className="text-sm text-destructive">
                  {(errors.startDate as { message?: string }).message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <DatePickerInput
                id="endDate"
                value={watch("endDate")}
                onChange={(value) =>
                  setValue("endDate", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              {errors.endDate && (
                <p className="text-sm text-destructive">
                  {(errors.endDate as { message?: string }).message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                min={0}
                {...register("sortOrder", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in the carousel.
              </p>
            </div>
          </>
        }
      />

      <AdminStickyActionBar>
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/promotions")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : initialData ? "Update" : "Create"}
          </Button>
        </div>
      </AdminStickyActionBar>
    </form>
  );
}

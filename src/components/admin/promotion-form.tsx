"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { promotionSchema, type PromotionInput } from "@/lib/validations";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import { AdminStickyActionBar } from "@/components/admin/admin-form-layout";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { FormError, SelectInput, TextInput } from "@/components/admin/rare/controls";
import { PROMOTION_TYPE_WORDS } from "@/components/admin/promotion-words";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";

interface PromotionFormProps {
  /** Upcoming published events, each with "Sat Nov 7" as `when`. */
  events: Array<{ id: string; title: string; when: string }>;
  vendors: Array<{ id: string; businessName: string }>;
  initialData?: Partial<PromotionInput> & { id: string };
  /** The event a new entry starts with, e.g. from the event editor's "Feature on the homepage". */
  eventId?: string;
}

type Target = "event" | "vendor";

function errorText(error: unknown): string | undefined {
  return (error as { message?: string } | undefined)?.message;
}

/** Feature an event or a vendor in the homepage carousel between two dates. */
export function PromotionForm({ events, vendors, initialData, eventId }: PromotionFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<Target>(initialData?.vendorProfileId ? "vendor" : "event");

  const dateOnly = (d: string | Date | undefined): string => {
    if (!d) return "";
    return typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  };

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<PromotionInput>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      eventId: initialData?.eventId ?? eventId ?? "",
      vendorProfileId: initialData?.vendorProfileId ?? "",
      type: initialData?.type ?? "FEATURED",
      sponsorName: initialData?.sponsorName ?? "",
      imageUrl: initialData?.imageUrl ?? "",
      linkUrl: initialData?.linkUrl ?? "",
      startDate: dateOnly(initialData?.startDate as string | Date | undefined),
      endDate: dateOnly(initialData?.endDate as string | Date | undefined),
      sortOrder: initialData?.sortOrder ?? 0,
    } as PromotionInput,
  });

  const imageUrl = useWatch({ control, name: "imageUrl" });
  const [done, setDone] = useState(false);
  const { leaving, stay, go } = useLeavePrompt(isDirty && !done, "/admin/promotions");

  function chooseTarget(next: Target) {
    setTargetType(next);
    if (next === "event") setValue("vendorProfileId", "", { shouldDirty: true });
    else setValue("eventId", "", { shouldDirty: true });
  }

  const onSubmit = async (data: PromotionInput) => {
    const then = leaving;
    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        ...data,
        eventId: targetType === "event" ? (data.eventId ?? "") : "",
        vendorProfileId: targetType === "vendor" ? (data.vendorProfileId ?? "") : "",
      };
      if (payload.startDate) payload.startDate = `${payload.startDate}T00:00:00.000Z`;
      if (payload.endDate) payload.endDate = `${payload.endDate}T23:59:59.999Z`;

      const res = await fetch(initialData ? `/api/admin/promotions/${initialData.id}` : "/api/admin/promotions", {
        method: initialData ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || "Could not save. Try again.");
      }

      toast.success(initialData ? "Saved." : "Added to the homepage.");
      setDone(true);
      if (then) go(then);
      else router.replace("/admin/promotions");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      stay();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="max-w-[656px] space-y-8">
        <Section id="what" title="What to feature">
          <Segmented<Target>
            label="Feature an event or a vendor"
            value={targetType}
            onChange={chooseTarget}
            options={[
              { value: "event", label: "An event" },
              { value: "vendor", label: "A vendor" },
            ]}
          />
          {targetType === "event" ? (
            <Field
              id="eventId"
              label="Event"
              help="Only events on the site that have not ended yet."
              required={!initialData}
              error={errorText(errors.eventId)}
            >
              <SelectInput {...register("eventId")}>
                <option value="">Choose an event</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}, {e.when}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ) : (
            <Field id="vendorProfileId" label="Vendor" required={!initialData} error={errorText(errors.vendorProfileId)}>
              <SelectInput {...register("vendorProfileId")}>
                <option value="">Choose a vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.businessName}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
        </Section>

        <Section id="when" title="When it shows">
          <FieldRow>
            <Field id="startDate" label="From" required error={errorText(errors.startDate)}>
              <TextInput type="date" {...register("startDate")} />
            </Field>
            <Field id="endDate" label="Until" required help="It shows through the end of this day." error={errorText(errors.endDate)}>
              <TextInput type="date" {...register("endDate")} />
            </Field>
          </FieldRow>
        </Section>

        <Section id="how" title="How it shows">
          <FieldRow>
            <Field id="type" label="Label">
              <SelectInput {...register("type")}>
                {(["FEATURED", "SPONSORED", "PARTNERSHIP"] as const).map((t) => (
                  <option key={t} value={t}>
                    {PROMOTION_TYPE_WORDS[t]}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="sponsorName" label="Sponsor" help="Shown on the card next to the label.">
              <TextInput {...register("sponsorName")} placeholder="Local Business Inc." />
            </Field>
          </FieldRow>
          <ImageUploadWithUrl
            value={imageUrl ?? ""}
            onChange={(url) => setValue("imageUrl", url, { shouldDirty: true })}
            uploadType="banner"
            label="Picture"
            aspectRatio="banner"
          />
          <Field id="linkUrl" label="Link">
            <TextInput type="url" inputMode="url" placeholder="https://" {...register("linkUrl")} />
          </Field>
          <Field id="sortOrder" label="Order" help="Lower numbers show first in the carousel.">
            <TextInput type="number" min={0} inputMode="numeric" className="w-32" {...register("sortOrder", { valueAsNumber: true })} />
          </Field>
        </Section>

        <FormError>{error}</FormError>
      </div>

      <AdminStickyActionBar className="flex flex-wrap items-center gap-2">
        {leaving ? (
          <LeavePrompt
            onStay={stay}
            onDiscard={() => go(leaving)}
            onSave={handleSubmit(onSubmit, stay)}
            saving={submitting}
            saveLabel={initialData ? "Save" : "Add to the homepage"}
            className="w-full"
          />
        ) : (
          <>
            <AdminButton type="submit" variant="ink" busy={submitting} busyLabel="Saving">
              {initialData ? "Save" : "Add to the homepage"}
            </AdminButton>
            <AdminLinkButton href="/admin/promotions" variant="quiet">
              Cancel
            </AdminLinkButton>
          </>
        )}
      </AdminStickyActionBar>
    </form>
  );
}

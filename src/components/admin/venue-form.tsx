"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { venueSchema, type VenueInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  AdminStickyActionBar,
  AdminTwoColumnFormLayout,
} from "@/components/admin/admin-form-layout";
import type { NeighborhoodOption } from "@/lib/neighborhoods-config";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useState } from "react";

interface VenueFormProps {
  initialData?: VenueInput & { id: string };
  neighborhoods: NeighborhoodOption[];
}

export function VenueForm({ initialData, neighborhoods }: VenueFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VenueInput>({
    resolver: zodResolver(venueSchema) as Resolver<VenueInput>,
    defaultValues: initialData ?? {
      name: "",
      address: "",
      city: "Spokane",
      state: "WA",
      zip: "",
      lat: 47.6588,
      lng: -117.426,
      neighborhood: "",
      parkingNotes: "",
    },
  });

  const onSubmit = async (data: VenueInput) => {
    setSubmitting(true);
    setError(null);

    try {
      const url = initialData
        ? `/api/admin/venues/${initialData.id}`
        : "/api/admin/venues";
      const method = initialData ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || "Failed to save venue");
      }

      toast.success(initialData ? "Venue updated." : "Venue created.");
      router.push("/admin/venues");
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
              <Label htmlFor="address">Address</Label>
              <Input id="address" {...register("address")} />
              {errors.address && (
                <p className="text-sm text-destructive">{errors.address.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" {...register("city")} />
                {errors.city && (
                  <p className="text-sm text-destructive">{errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input id="state" {...register("state")} />
                {errors.state && (
                  <p className="text-sm text-destructive">{errors.state.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">ZIP</Label>
                <Input id="zip" {...register("zip")} />
                {errors.zip && (
                  <p className="text-sm text-destructive">{errors.zip.message}</p>
                )}
              </div>
            </div>
          </>
        }
        aside={
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lat">Latitude</Label>
                <Input id="lat" type="number" step="any" {...register("lat")} />
                {errors.lat && (
                  <p className="text-sm text-destructive">{errors.lat.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lng">Longitude</Label>
                <Input id="lng" type="number" step="any" {...register("lng")} />
                {errors.lng && (
                  <p className="text-sm text-destructive">{errors.lng.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="neighborhood">Neighborhood</Label>
              <Select id="neighborhood" {...register("neighborhood")}>
                <option value="">Select neighborhood...</option>
                {neighborhoods.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="parkingNotes">Parking Notes</Label>
              <Textarea id="parkingNotes" rows={3} {...register("parkingNotes")} />
            </div>
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
                ? "Update Venue"
                : "Create Venue"}
          </Button>
        </div>
      </AdminStickyActionBar>
    </form>
  );
}

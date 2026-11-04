"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { NeighborhoodOption } from "@/lib/neighborhoods-config";
import { ChipToggles } from "@/components/admin/kit/chip-toggles";
import { Field } from "@/components/admin/kit/field";
import { TextInput } from "@/components/admin/rare/controls";
import { EditDialog } from "@/components/admin/rare/edit-dialog";
import { useAnnounce } from "@/components/admin/shell/live-region";

interface SubscriberFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: { id: string; email: string; areas: string[] };
  neighborhoods: NeighborhoodOption[];
}

/** Adds a subscriber, or edits one and offers to remove them from the list. */
export function SubscriberForm({ open, onOpenChange, initialData, neighborhoods }: SubscriberFormProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [areas, setAreas] = useState<string[]>(initialData?.areas ?? []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [openedFor, setOpenedFor] = useState<{ open: boolean; id?: string }>({ open: false });

  if (openedFor.open !== open || openedFor.id !== initialData?.id) {
    setOpenedFor({ open, id: initialData?.id });
    if (open) {
      setEmail(initialData?.email ?? "");
      setAreas(initialData?.areas ?? []);
      setError(null);
    }
  }

  const done = (message: string) => {
    onOpenChange(false);
    toast.success(message);
    announce(message);
    router.refresh();
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const url = initialData ? `/api/admin/subscribers/${initialData.id}` : "/api/admin/subscribers";
      const res = await fetch(url, {
        method: initialData ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, areas }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error?.email?.[0] ?? json.error;
        setError(typeof msg === "string" ? msg : "Something went wrong. Try again.");
        return;
      }
      done(initialData ? `Saved ${email}.` : `Added ${email}.`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    if (!initialData) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/subscribers/${initialData.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove this subscriber. Try again.");
        return;
      }
      done(`Removed ${initialData.email} from the list.`);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initialData ? "Edit subscriber" : "Add a subscriber"}
      description="They get the weekly email about what is on."
      formId="subscriber-form"
      onSubmit={handleSubmit}
      saveLabel={initialData ? "Save" : "Add"}
      saving={submitting}
      error={error}
      removing={removing}
      remove={
        initialData
          ? {
              label: "Remove from the list",
              title: `Remove ${initialData.email}?`,
              description: "They stop getting the weekly email. They can sign up again on the site.",
              confirmLabel: "Remove",
              busyLabel: "Removing",
              run: handleRemove,
            }
          : undefined
      }
    >
      <Field id="subscriber-email" label="Email" required>
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </Field>
      <div>
        <p className="font-text text-sm font-medium text-basalt">Areas</p>
        <p className="mt-0.5 text-xs text-ash">Leave all off to hear about every area.</p>
        <ChipToggles
          label="Areas"
          className="mt-2"
          options={neighborhoods.map((n) => ({ value: n.value, label: n.label }))}
          value={areas}
          onChange={setAreas}
        />
      </div>
    </EditDialog>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { PublicIsland, type PublicPalette } from "@/components/admin/kit/public-island";
import { FormError, TextArea, TextInput } from "@/components/admin/site/inputs";
import { Switch } from "@/components/admin/site/switch";
import { useUnsavedSection } from "@/components/admin/site/unsaved";
import { SiteAnnouncementBar } from "@/components/layout/site-announcement";
import { saveAnnouncement } from "@/app/admin/_actions/site";
import { settle } from "@/lib/admin/settle";
import type { SiteAnnouncement } from "@/lib/site-announcement";

type Draft = { enabled: boolean; text: string; linkLabel: string; linkUrl: string };

const FIELD_IDS: ReadonlyArray<readonly [keyof Draft, string]> = [
  ["text", "announcement-text"],
  ["linkLabel", "announcement-link-label"],
  ["linkUrl", "announcement-link-url"],
];

function toDraft(a: SiteAnnouncement): Draft {
  return { enabled: a.enabled, text: a.text, linkLabel: a.linkLabel ?? "", linkUrl: a.linkUrl ?? "" };
}

function sameDraft(a: Draft, b: Draft) {
  return a.enabled === b.enabled && a.text === b.text && a.linkLabel === b.linkLabel && a.linkUrl === b.linkUrl;
}

/**
 * The announcement bar: on or off, the message and an optional link, with a live preview of the
 * real public bar in the site's palette. The preview is inert, so its link cannot be followed.
 */
export function SiteAnnouncementForm({
  initialAnnouncement,
  palette,
}: {
  initialAnnouncement: SiteAnnouncement;
  palette: PublicPalette;
}) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(() => toDraft(initialAnnouncement));
  const [draft, setDraft] = React.useState(saved);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const dirty = !sameDraft(draft, saved);
  useUnsavedSection("announcement", "Announcement bar", dirty);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await settle(saveAnnouncement(draft));
      if (!result.ok) {
        const fieldErrors = result.fieldErrors ?? {};
        setErrors(fieldErrors);
        setFormError(`Not saved. ${result.error}`);
        const firstInvalid = FIELD_IDS.find(([key]) => key in fieldErrors)?.[1];
        if (firstInvalid) window.requestAnimationFrame(() => document.getElementById(firstInvalid)?.focus());
        return;
      }
      setErrors({});
      setSaved(draft);
      toast.success(draft.enabled ? "Announcement bar saved. It shows on every page." : "Announcement bar saved. It is off.");
      router.refresh();
    });
  };

  const preview = { enabled: true, text: draft.text.trim() || "Your message shows here.", linkLabel: draft.linkLabel.trim() || null, linkUrl: draft.linkUrl.trim() || null };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Switch
        checked={draft.enabled}
        onCheckedChange={(on) => set("enabled", on)}
        label="Show the announcement bar"
        help="A slim line under the main header on every public page."
      />
      <Field id="announcement-text" label="Message" help="Keep it to one sentence so it stays noticeable." error={errors.text}>
        <TextArea
          value={draft.text}
          onChange={(e) => set("text", e.target.value)}
          placeholder="Vendor applications are open for the holiday markets."
          rows={2}
        />
      </Field>
      <FieldRow>
        <Field id="announcement-link-label" label="Link label" help="Optional, for example Apply now." error={errors.linkLabel}>
          <TextInput value={draft.linkLabel} onChange={(e) => set("linkLabel", e.target.value)} />
        </Field>
        <Field id="announcement-link-url" label="Link" help="A page on the site, such as /submit, or a full web address." error={errors.linkUrl}>
          <TextInput value={draft.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} inputMode="url" />
        </Field>
      </FieldRow>

      <div>
        <p className="text-sm font-medium text-basalt">Preview</p>
        <p className="mt-0.5 text-xs text-ash">
          {draft.enabled ? "This is how the bar looks on the public site." : "Hidden on the site while the bar is off."}
        </p>
        <div className="mt-2 overflow-hidden rounded-md border border-seam">
          <PublicIsland palette={palette}>
            <div inert>
              <SiteAnnouncementBar announcement={preview} />
            </div>
          </PublicIsland>
        </div>
      </div>

      <FormError>{formError}</FormError>
      <div className="flex items-center gap-3">
        <AdminButton type="submit" variant={dirty ? "ink" : "outline"} disabled={!dirty} busy={pending} busyLabel="Saving">
          Save
        </AdminButton>
        {dirty && <span className="text-xs text-ash">Unsaved changes</span>}
      </div>
    </form>
  );
}

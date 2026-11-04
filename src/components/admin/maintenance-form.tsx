"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceMode } from "@prisma/client";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Field } from "@/components/admin/kit/field";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { FormError, TextArea, TextInput } from "@/components/admin/site/inputs";
import { useUnsavedSection } from "@/components/admin/site/unsaved";
import { saveMaintenance } from "@/app/admin/_actions/site";
import { settle } from "@/lib/admin/settle";
import { DEFAULT_MAINTENANCE_TITLE, MAINTENANCE_MODES, withoutBlankLinks } from "@/lib/site/settings-input";
import { cn, formatForDateTimeLocal } from "@/lib/utils";

type MaintenanceLink = { label: string; url: string };

type Draft = {
  mode: MaintenanceMode;
  messageTitle: string;
  messageBody: string;
  links: MaintenanceLink[];
  eta: string;
};

function sameDraft(a: Draft, b: Draft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Maintenance mode and the page people see while it is on. Closing the site asks first. */
export function MaintenanceForm({
  initialState,
}: {
  initialState: {
    mode: MaintenanceMode;
    messageTitle: string;
    messageBody: string | null;
    links: MaintenanceLink[];
    eta: Date | null;
  };
}) {
  const router = useRouter();
  const [saved, setSaved] = React.useState<Draft>(() => ({
    mode: initialState.mode,
    messageTitle: initialState.messageTitle,
    messageBody: initialState.messageBody ?? "",
    links: initialState.links.map((l) => ({ ...l })),
    eta: initialState.eta ? formatForDateTimeLocal(new Date(initialState.eta)) : "",
  }));
  const [draft, setDraft] = React.useState(saved);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const linkList = React.useRef<HTMLUListElement>(null);
  const addLinkButton = React.useRef<HTMLButtonElement>(null);
  const focusAfterRemove = React.useRef<number | null>(null);
  const dirty = !sameDraft(draft, saved);
  useUnsavedSection("maintenance", "Maintenance", dirty);
  const closing = draft.mode !== "OFF" && saved.mode === "OFF";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setLink = (index: number, patch: Partial<MaintenanceLink>) =>
    set(
      "links",
      draft.links.map((l, i) => (i === index ? { ...l, ...patch } : l))
    );

  React.useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const removes = linkList.current?.querySelectorAll<HTMLButtonElement>("[data-link-remove]");
    (removes?.[index] ?? addLinkButton.current)?.focus();
  }, [draft.links.length]);

  const removeLink = (index: number) => {
    focusAfterRemove.current = index;
    set(
      "links",
      draft.links.filter((_, j) => j !== index)
    );
  };

  /** Blank link rows are dropped before saving, so error keys like links.1.url match the rows shown. */
  const save = () => {
    setFormError(null);
    const next = { ...draft, links: withoutBlankLinks(draft.links) };
    setDraft(next);
    startTransition(async () => {
      const result = await settle(saveMaintenance(next));
      setConfirming(false);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setErrors({});
      setSaved(next);
      toast.success(next.mode === "OFF" ? "Maintenance is off. The site is open to everyone." : "Maintenance is on.");
      router.refresh();
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (closing) setConfirming(true);
    else save();
  };

  const chosen = MAINTENANCE_MODES.find((m) => m.value === draft.mode);

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <fieldset>
        <legend className="text-sm font-medium text-basalt">Who can use the site</legend>
        <div className="mt-1.5 divide-y divide-seam border-y border-seam">
          {MAINTENANCE_MODES.map((option) => {
            const id = `maintenance-${option.value}`;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5", draft.mode === option.value ? "bg-lilac-tint" : "hover:bg-hover")}
              >
                <input
                  id={id}
                  type="radio"
                  name="maintenance-mode"
                  value={option.value}
                  checked={draft.mode === option.value}
                  onChange={() => set("mode", option.value)}
                  className="mt-0.5 size-4 shrink-0 accent-basalt"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-basalt">
                    {option.label}
                    {option.value === saved.mode && <span className="font-normal text-ash"> (now)</span>}
                  </span>
                  <span className="block text-xs text-ash">{option.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field id="maintenance-title" label="Heading of the maintenance page" error={errors.messageTitle}>
        <TextInput value={draft.messageTitle} onChange={(e) => set("messageTitle", e.target.value)} placeholder={DEFAULT_MAINTENANCE_TITLE} />
      </Field>
      <Field
        id="maintenance-body"
        label="Message"
        help="Markdown works: links as [text](address), lists, bold, and a line starting with > for a note."
        error={errors.messageBody}
      >
        <TextArea value={draft.messageBody} onChange={(e) => set("messageBody", e.target.value)} rows={4} long />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium text-basalt">Links on the maintenance page</legend>
        <p className="mt-0.5 text-xs text-ash">Optional buttons under the message, such as a status page.</p>
        <ul ref={linkList} className="mt-2 space-y-2">
          {draft.links.map((link, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
              <TextInput
                aria-label={`Label of link ${i + 1}`}
                placeholder="Label"
                value={link.label}
                onChange={(e) => setLink(i, { label: e.target.value })}
                aria-invalid={errors[`links.${i}.label`] ? true : undefined}
              />
              <TextInput
                aria-label={`Link ${i + 1}`}
                placeholder="/status or https://"
                value={link.url}
                onChange={(e) => setLink(i, { url: e.target.value })}
                aria-invalid={errors[`links.${i}.url`] ? true : undefined}
                className="max-sm:order-3"
              />
              <Tooltip content="Remove link">
                <AdminButton
                  variant="quiet"
                  size="icon"
                  aria-label={`Remove link ${i + 1}`}
                  data-link-remove
                  onClick={() => removeLink(i)}
                >
                  <X strokeWidth={1.75} aria-hidden="true" />
                </AdminButton>
              </Tooltip>
            </li>
          ))}
        </ul>
        <AdminButton
          ref={addLinkButton}
          variant="quiet"
          size="sm"
          className="mt-2"
          onClick={() => set("links", [...draft.links, { label: "", url: "" }])}
        >
          <Plus strokeWidth={1.75} aria-hidden="true" />
          Add a link
        </AdminButton>
      </fieldset>

      <Field id="maintenance-eta" label="Expected back" help="Optional. Pacific time, shown on the maintenance page." error={errors.eta}>
        <TextInput type="datetime-local" value={draft.eta} onChange={(e) => set("eta", e.target.value)} className="sm:max-w-64" />
      </Field>

      <FormError>{formError}</FormError>
      <div className="flex items-center gap-3">
        <AdminButton type="submit" variant={dirty ? "ink" : "outline"} disabled={!dirty} busy={pending && !confirming} busyLabel="Saving">
          Save
        </AdminButton>
        {dirty && <span className="text-xs text-ash">Unsaved changes</span>}
      </div>

      <AdminDialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
        title="Close the site?"
        description={chosen ? `${chosen.label}. ${chosen.description}` : undefined}
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setConfirming(false)} disabled={pending} data-autofocus>
              Keep it open
            </AdminButton>
            <AdminButton variant="danger" onClick={save} busy={pending} busyLabel="Closing">
              Close the site
            </AdminButton>
          </>
        }
      >
        <p className="text-sm text-basalt">It happens as soon as you confirm. Come back here and choose Off to open it again.</p>
      </AdminDialog>
    </form>
  );
}

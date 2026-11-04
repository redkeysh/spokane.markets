"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton, AdminLinkButton, adminButtonClass } from "@/components/admin/kit/button";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { HistoryList, type HistoryListEntry } from "@/components/admin/kit/history-list";
import { Menu } from "@/components/admin/kit/menu";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { SaveBar, unsavedText, useSavedText } from "@/components/admin/kit/save-bar";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { toastWithUndo } from "@/components/admin/kit/toaster";
import { ToggleChip } from "@/components/admin/kit/toggle-chip";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useShell, type LeaveTarget } from "@/components/admin/shell/shell-context";
import { FormError, TextArea, TextInput } from "@/components/admin/site/inputs";
import { SectionLinks } from "@/components/admin/site/site-section";
import { Switch } from "@/components/admin/site/switch";
import { GalleryField } from "@/components/admin/vendors/gallery-field";
import { OwnerPicker, type OwnerOption } from "@/components/admin/vendors/owner-picker";
import { VendorEvents } from "@/components/admin/vendors/vendor-events";
import { VerificationPanel } from "@/components/admin/vendors/verification-panel";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import { archiveVendor, restoreVendor, saveVendor } from "@/app/admin/_actions/vendors";
import { fieldErrorsOf, vendorEditorSchema, type VendorEditorInput } from "@/lib/vendors/admin-input";
import { vendorPageHref, verificationMarkStatus } from "@/lib/vendors/admin-list";
import type { VendorEventsAt } from "@/lib/vendors/events-at";
import { settle } from "@/lib/admin/settle";
import { cn, normalizeUrlToHttps, slugify } from "@/lib/utils";

export type VendorBadgeOption = { id: string; name: string; description: string | null };

/** In pane mode the editor is a scroller over a 56 px action bar; in page mode the bar sticks to the bottom. */
const PANE_GRID = "[@media(min-width:1024px)_and_(min-height:600px)]:grid [@media(min-width:1024px)_and_(min-height:600px)]:grid-rows-[minmax(0,1fr)_56px]";

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "contact", label: "Contact" },
  { id: "pictures", label: "Pictures" },
  { id: "links", label: "Links" },
  { id: "events", label: "Events" },
  { id: "history", label: "History" },
  { id: "verification", label: "Verification" },
];

const FIELD_SECTION: Partial<Record<keyof VendorEditorInput, string>> = {
  businessName: "profile",
  slug: "profile",
  description: "profile",
  specialties: "profile",
  primaryCategory: "profile",
  serviceAreaLabel: "profile",
  listingCommunityBadgeIds: "profile",
  contactEmail: "contact",
  contactPhone: "contact",
  imageUrl: "pictures",
  heroImageUrl: "pictures",
  galleryUrls: "pictures",
  websiteUrl: "links",
  facebookUrl: "links",
  instagramUrl: "links",
  userId: "verification",
};

function changedKeys(a: VendorEditorInput, b: VendorEditorInput): string[] {
  return (Object.keys(a) as (keyof VendorEditorInput)[]).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

function socialHref(value: string, platform: "facebook" | "instagram") {
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v) || v.includes(".com/")) return normalizeUrlToHttps(v);
  return `https://${platform}.com/${v.replace(/^@/, "")}`;
}

/**
 * The vendor page: Profile, Contact, Pictures and Links in the main column, the events the vendor
 * is at and its history below them, and Verification with its checklist and the owner in the side
 * column. Changes are held until Save; leaving with unsaved changes asks in the action bar first.
 */
export function AdminVendorForm({
  vendor,
  initial,
  initialOwner,
  ownerEmailVerified = false,
  badgeOptions,
  categories,
  eventsAt,
  history = null,
  backHref = "/admin/vendors",
}: {
  /** null on the new vendor page. */
  vendor: { id: string; slug: string; archived: boolean; updatedAt: string } | null;
  initial: VendorEditorInput;
  initialOwner: OwnerOption | null;
  ownerEmailVerified?: boolean;
  badgeOptions: VendorBadgeOption[];
  categories: string[];
  eventsAt: VendorEventsAt | null;
  /** null on the new vendor page. */
  history?: HistoryListEntry[] | null;
  /** The vendor list address to return to, with its filters. */
  backHref?: string;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const shell = useShell();
  const [saved, setSaved] = React.useState(initial);
  const [draft, setDraft] = React.useState(initial);
  const [owner, setOwner] = React.useState(initialOwner);
  const [savedOwnerVerified, setSavedOwnerVerified] = React.useState(ownerEmailVerified);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [leaving, setLeaving] = React.useState<LeaveTarget | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const changed = changedKeys(draft, saved);
  const dirty = changed.length > 0;
  const isNew = vendor === null;
  const archived = vendor?.archived ?? false;
  const readOnly = archived || pending;
  const suggestedSlug = slugify(draft.businessName);

  const [seenInitial, setSeenInitial] = React.useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    if (!dirty) {
      setSaved(initial);
      setDraft(initial);
      setOwner(initialOwner);
      setSavedOwnerVerified(ownerEmailVerified);
    }
  }

  const set = <K extends keyof VendorEditorInput>(key: K, value: VendorEditorInput[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  };

  const showErrors = (fieldErrors: Record<string, string>) => {
    setErrors(fieldErrors);
    const first = Object.keys(fieldErrors)[0];
    if (!first) return;
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`vendor-${first}`) ?? document.getElementById(FIELD_SECTION[first as keyof VendorEditorInput] ?? "");
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ block: "center" });
    });
  };

  const save = (then?: LeaveTarget) => {
    if (readOnly || (!isNew && !dirty)) return;
    setFormError(null);
    const local = vendorEditorSchema.safeParse(draft);
    if (!local.success) {
      const fieldErrors = fieldErrorsOf(local.error);
      showErrors(fieldErrors);
      announce(`Not saved. ${Object.values(fieldErrors)[0]}`);
      return;
    }
    startTransition(async () => {
      const result = await settle(saveVendor(vendor?.id ?? null, draft));
      if (!result.ok) {
        if (result.fieldErrors) showErrors(result.fieldErrors);
        setFormError(result.error);
        announce(`Not saved. ${result.error}`);
        return;
      }
      const name = draft.businessName.trim();
      setErrors({});
      setSaved({ ...draft, slug: result.slug });
      setDraft((d) => ({ ...d, slug: result.slug }));
      setSavedAt(new Date());
      setLeaving(null);
      if (isNew) {
        toast.success(`Published ${name}. Its profile is on the site.`);
        if (then?.kind === "back") shell.leave(then);
        else router.replace(then ? then.href : vendorPageHref(result.id, backHref));
      } else {
        toast.success(`Saved ${name}.`);
        if (then) shell.leave(then);
        else router.refresh();
      }
    });
  };

  const leave = (href: string) => {
    if (dirty && !archived) setLeaving({ kind: "href", href });
    else router.push(href);
  };

  const onArchive = async () => {
    if (!vendor) return;
    const result = await settle(archiveVendor(vendor.id));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    announce(`Archived ${result.businessName}.`);
    toastWithUndo(`Archived ${result.businessName}. It is off the site.`, async () => {
      const undone = await settle(restoreVendor(vendor.id));
      if (undone.ok) router.refresh();
      else toast.error(undone.error);
    });
    router.refresh();
  };

  const onRestore = async () => {
    if (!vendor) return;
    const result = await settle(restoreVendor(vendor.id));
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Restored ${result.businessName}. It is back on the site.`);
    announce(`Restored ${result.businessName}.`);
    router.refresh();
  };

  useShortcuts({
    "mod+s": () => save(),
    escape: (e) => {
      if ((e.target as Element | null)?.closest?.("[role=dialog], [role=listbox], [role=menu]")) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      if (leaving) setLeaving(null);
      else leave(backHref);
    },
  });

  useLeaveGuard(dirty && !archived, setLeaving, backHref);

  const err = (key: keyof VendorEditorInput) => errors[key];
  const title = draft.businessName.trim() || (isNew ? "New vendor" : saved.businessName);
  const savedText = useSavedText(savedAt ? savedAt.getTime() : vendor ? Date.parse(vendor.updatedAt) : null);

  const statusLine = archived
    ? "Archived: not on the site."
    : isNew
      ? "Not on the site until you publish it."
      : dirty
        ? unsavedText(changed.length)
        : (savedText ?? "No unsaved changes");

  return (
    <Screen bottomBar={false} className={PANE_GRID}>
      <Pane label={isNew ? "New vendor" : `Vendor: ${saved.businessName}`} className="p-0">
        <form
          id="vendor-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mx-auto max-w-[1232px] px-4 pt-4 pb-10 md:px-6 md:pt-5"
        >
          <header className="space-y-1">
            <Link
              href={backHref}
              className="inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline"
            >
              Back to Vendors
            </Link>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 className="min-w-0 font-display text-xl/[26px] font-bold text-basalt">{title}</h1>
              {!isNew && (
                <StatusMark
                  status={archived ? "ARCHIVED" : verificationMarkStatus(saved.verificationStatus)}
                  chip
                />
              )}
              {vendor && !archived && (
                <a
                  href={`/vendors/${vendor.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(adminButtonClass({ variant: "quiet", size: "sm" }), "ml-auto")}
                >
                  View on site<span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
            {archived && (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-seam py-2">
                <p className="text-sm text-basalt">Archived. Not on the site and out of the vendor list.</p>
                <AdminButton variant="outline" size="sm" onClick={onRestore}>
                  Restore
                </AdminButton>
              </div>
            )}
            <SectionLinks
              label="Sections"
              links={SECTIONS.filter((x) => (x.id !== "events" || eventsAt) && (x.id !== "history" || history))}
              className="pt-2"
            />
          </header>

          <fieldset disabled={archived} className="@container mt-6 min-w-0">
            <div className="grid gap-x-6 gap-y-8 @[960px]:grid-cols-[minmax(0,1fr)_296px] @[1180px]:grid-cols-[minmax(0,1fr)_360px] @[1180px]:gap-x-10">
              <div className="min-w-0 space-y-8">
                <Section id="profile" title="Profile">
                  <Field id="vendor-businessName" label="Business name" required error={err("businessName")}>
                    <TextInput value={draft.businessName} onChange={(e) => set("businessName", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field
                    id="vendor-slug"
                    label="Web address"
                    help={isNew ? "Left empty, it is made from the name." : "Changing this changes the public link."}
                    error={err("slug")}
                  >
                    <SlugInput
                      value={draft.slug}
                      placeholder={suggestedSlug}
                      onChange={(v) => set("slug", v)}
                      onAuto={() => set("slug", suggestedSlug)}
                    />
                  </Field>
                  <Field id="vendor-description" label="Description" help="What they sell and what makes it theirs." error={err("description")}>
                    <TextArea long rows={4} value={draft.description} onChange={(e) => set("description", e.target.value)} />
                  </Field>
                  <Field id="vendor-specialties" label="Specialties" help="Short and comma separated, for example: pottery, mugs, planters." error={err("specialties")}>
                    <TextInput value={draft.specialties} onChange={(e) => set("specialties", e.target.value)} />
                  </Field>
                  <CategoryPicker categories={categories} value={draft.primaryCategory} onChange={(v) => set("primaryCategory", v)} error={err("primaryCategory")} />
                  <Field id="vendor-serviceAreaLabel" label="Service area" help="A town or area, never a street address." error={err("serviceAreaLabel")}>
                    <TextInput value={draft.serviceAreaLabel} onChange={(e) => set("serviceAreaLabel", e.target.value)} placeholder="Spokane Valley" />
                  </Field>
                  {badgeOptions.length > 0 && (
                    <div>
                      <p id="vendor-badges-label" className="text-sm font-medium text-basalt">
                        Community badges
                      </p>
                      <p className="mt-0.5 text-xs text-ash">Badges the vendor identifies with, shown on their profile.</p>
                      <div role="group" aria-labelledby="vendor-badges-label" id="vendor-listingCommunityBadgeIds" className="mt-2 flex flex-wrap gap-2">
                        {badgeOptions.map((badge) => (
                          <ToggleChip
                            key={badge.id}
                            pressed={draft.listingCommunityBadgeIds.includes(badge.id)}
                            onPressedChange={(on) =>
                              set(
                                "listingCommunityBadgeIds",
                                on ? [...draft.listingCommunityBadgeIds, badge.id] : draft.listingCommunityBadgeIds.filter((b) => b !== badge.id)
                              )
                            }
                          >
                            {badge.name}
                          </ToggleChip>
                        ))}
                      </div>
                      <FormError className="mt-1 text-xs">{err("listingCommunityBadgeIds")}</FormError>
                    </div>
                  )}
                </Section>

                <Section id="contact" title="Contact">
                  <FieldRow>
                    <Field id="vendor-contactEmail" label="Email" error={err("contactEmail")}>
                      <TextInput type="email" inputMode="email" autoComplete="off" value={draft.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                    </Field>
                    <Field id="vendor-contactPhone" label="Phone" error={err("contactPhone")}>
                      <TextInput type="tel" inputMode="tel" autoComplete="off" value={draft.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
                    </Field>
                  </FieldRow>
                  <Switch
                    checked={draft.contactVisible}
                    onCheckedChange={(on) => set("contactVisible", on)}
                    label="Show contact details on their profile"
                    help="Off keeps the email and phone for you only."
                  />
                  <Switch
                    checked={draft.socialLinksVisible}
                    onCheckedChange={(on) => set("socialLinksVisible", on)}
                    label="Show social links on their profile"
                    help="The website, Facebook and Instagram links under Links."
                  />
                </Section>

                <Section id="pictures" title="Pictures">
                  <div id="vendor-imageUrl" tabIndex={-1} className="grid gap-6">
                    <ImageUploadWithUrl
                      value={draft.imageUrl ?? ""}
                      onChange={(url) => set("imageUrl", url)}
                      uploadType="vendor"
                      disabled={readOnly}
                      label="Profile picture"
                      aspectRatio="square"
                    />
                    <div id="vendor-heroImageUrl" tabIndex={-1} className="min-w-0">
                      <ImageUploadWithUrl
                        value={draft.heroImageUrl ?? ""}
                        onChange={(url) => set("heroImageUrl", url)}
                        uploadType="vendor"
                        disabled={readOnly}
                        label="Cover picture"
                        aspectRatio="banner"
                      />
                    </div>
                  </div>
                  <FormError className="text-xs">{err("imageUrl") ?? err("heroImageUrl")}</FormError>
                  <GalleryField
                    id="vendor-galleryUrls"
                    value={draft.galleryUrls}
                    onChange={(urls) => set("galleryUrls", urls)}
                    disabled={readOnly}
                    error={err("galleryUrls")}
                  />
                </Section>

                <Section id="links" title="Links">
                  <p className="-mt-1 text-xs text-ash">A web address or just the name works for each; they are tidied when you save.</p>
                  <LinkField id="vendor-websiteUrl" label="Website" placeholder="sunshinefarm.com" value={draft.websiteUrl ?? ""} onChange={(v) => set("websiteUrl", v)} href={draft.websiteUrl?.trim() ? normalizeUrlToHttps(draft.websiteUrl) : null} error={err("websiteUrl")} />
                  <LinkField id="vendor-facebookUrl" label="Facebook" placeholder="Page name or link" value={draft.facebookUrl} onChange={(v) => set("facebookUrl", v)} href={socialHref(draft.facebookUrl, "facebook")} error={err("facebookUrl")} />
                  <LinkField id="vendor-instagramUrl" label="Instagram" placeholder="Handle or link" value={draft.instagramUrl} onChange={(v) => set("instagramUrl", v)} href={socialHref(draft.instagramUrl, "instagram")} error={err("instagramUrl")} />
                </Section>

                {eventsAt && (
                  <Section id="events" title="Events this vendor is at">
                    <VendorEvents eventsAt={eventsAt} back={vendor ? vendorPageHref(vendor.id, backHref) : undefined} />
                  </Section>
                )}

                {history && (
                  <Section id="history" title="History">
                    <HistoryList entries={history} stickyHeadings={false} />
                  </Section>
                )}
              </div>

              <aside className="min-w-0 space-y-8">
                <Section id="verification" title="Verification">
                  <VerificationPanel
                    value={draft.verificationStatus}
                    onChange={(v) => set("verificationStatus", v)}
                    draft={draft}
                    claimed={owner !== null}
                    emailVerified={owner !== null && owner.id === initialOwner?.id && savedOwnerVerified}
                    disabled={readOnly}
                  />
                </Section>
                <Section id="owner" title="Claimed by">
                  <div>
                    <OwnerPicker
                      id="vendor-userId"
                      vendorId={vendor?.id ?? null}
                      value={owner}
                      onChange={(next) => {
                        setOwner(next);
                        set("userId", next?.id ?? null);
                      }}
                      disabled={readOnly}
                      labelledBy="owner-heading"
                      describedBy="vendor-userId-help"
                      invalid={Boolean(err("userId"))}
                    />
                    <p id="vendor-userId-help" className="mt-1 text-xs text-ash">
                      The account that can edit this profile. Empty means nobody has claimed it.
                    </p>
                    <FormError className="mt-1 text-xs">{err("userId")}</FormError>
                  </div>
                </Section>
              </aside>
            </div>
          </fieldset>
        </form>
      </Pane>

      <SaveBar
        dirty={dirty}
        state={statusLine}
        error={formError}
        leave={
          leaving
            ? {
                saving: pending,
                onStay: () => setLeaving(null),
                onDiscard: () => {
                  const to = leaving;
                  setLeaving(null);
                  setDraft(saved);
                  shell.leave(to);
                },
                onSave: () => save(leaving),
                saveLabel: isNew ? "Publish" : "Save",
                busyLabel: isNew ? "Publishing" : "Saving",
                saveVariant: isNew ? "publish" : "ink",
              }
            : null
        }
      >
        {vendor && !archived && (
          <Menu
            label="More"
            trigger="More"
            variant="outline"
            size="md"
            placement="top-end"
            items={[
              { label: "View on site", href: `/vendors/${vendor.slug}`, external: true },
              { label: "Archive", description: "Off the site and out of every list. Can be restored.", onSelect: onArchive },
            ]}
          />
        )}
        {!archived && (
          <AdminButton variant="outline" keys="Esc" onClick={() => leave(backHref)} className="max-md:hidden">
            Cancel
          </AdminButton>
        )}
        {archived ? (
          <AdminLinkButton href={backHref} variant="outline">
            Back to Vendors
          </AdminLinkButton>
        ) : (
          <AdminButton
            type="submit"
            form="vendor-form"
            variant={isNew ? "publish" : "ink"}
            keys="Ctrl+S"
            busy={pending}
            busyLabel={isNew ? "Publishing" : "Saving"}
            disabled={!isNew && !dirty}
          >
            {isNew ? "Publish" : "Save"}
          </AdminButton>
        )}
      </SaveBar>
    </Screen>
  );
}

function SlugInput({
  value,
  placeholder,
  onChange,
  onAuto,
  ...described
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onAuto: () => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="w-full text-xs text-ash sm:hidden">
        spokane.markets/vendors/
      </span>
      <div className="flex min-w-56 flex-1 items-center rounded-md border border-seam-strong bg-sheet pl-3 has-[input:disabled]:opacity-50 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-lilac">
        <span aria-hidden="true" className="shrink-0 text-sm text-ash max-sm:hidden">
          spokane.markets/vendors/
        </span>
        <input
          {...described}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          autoComplete="off"
          spellCheck={false}
          className="h-9 min-w-24 flex-1 bg-transparent pr-3 font-text text-sm text-basalt outline-none placeholder:text-ash-quiet pointer-coarse:h-11 pointer-coarse:text-base"
        />
      </div>
      <AdminButton variant="outline" size="sm" onClick={onAuto}>
        Make from the name
      </AdminButton>
    </div>
  );
}

function CategoryPicker({
  categories,
  value,
  onChange,
  error,
}: {
  categories: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const known = categories.some((c) => c.toLowerCase() === value.trim().toLowerCase());
  return (
    <div>
      <label htmlFor="vendor-primaryCategory" className="block text-sm font-medium text-basalt">
        Primary category
      </label>
      {categories.length > 0 && (
        <div role="group" aria-label="Categories in use" className="mt-1.5 flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = c.toLowerCase() === value.trim().toLowerCase();
            return (
              <ToggleChip key={c} pressed={on} onPressedChange={(pressed) => onChange(pressed ? c : "")}>
                {c}
              </ToggleChip>
            );
          })}
        </div>
      )}
      <TextInput
        id="vendor-primaryCategory"
        className="mt-2"
        value={known ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={categories.length > 0 ? "Or type a new one" : "For example Produce, Crafts, Baked goods"}
        aria-describedby="vendor-primaryCategory-help"
        aria-invalid={error ? true : undefined}
      />
      <p id="vendor-primaryCategory-help" className="mt-1 text-xs text-ash">
        One word or two that shoppers browse by.
      </p>
      <FormError className="mt-1 text-xs">{error}</FormError>
    </div>
  );
}

function LinkField({
  id,
  label,
  placeholder,
  value,
  onChange,
  href,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  href: string | null;
  error?: string;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <LinkInput value={value} placeholder={placeholder} onChange={onChange} href={href} label={label} />
    </Field>
  );
}

function LinkInput({
  value,
  placeholder,
  onChange,
  href,
  label,
  ...described
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  href: string | null;
  label: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-2">
      <TextInput {...described} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} />
      {href && (
        <a href={href} target="_blank" rel="noreferrer" className={adminButtonClass({ variant: "quiet", size: "sm" })}>
          Open<span className="sr-only"> {label} (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

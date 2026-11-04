"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { ChipToggles } from "@/components/admin/kit/chip-toggles";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { SaveBar, unsavedText, useSavedText } from "@/components/admin/kit/save-bar";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import { UserSearchInput } from "@/components/admin/user-search-input";
import { changedKeys, marketSlugFrom, type MarketDetails } from "@/lib/markets/details";
import { CheckLine, SelectInput, TextArea, TextInput } from "./controls";

export type DetailsOptions = {
  places: { id: string; name: string; city: string }[];
  neighborhoods: { value: string; label: string }[];
  badges: { id: string; name: string; description: string | null }[];
};

export type DetailErrors = Partial<Record<keyof MarketDetails, string>>;

type GroupKey = "place" | "about" | "owner" | "vendors" | "picture" | "badges" | "compliance";

/** Which group holds each field, so a failed save opens the group with the error. */
const GROUP_OF: Record<keyof MarketDetails, GroupKey> = {
  name: "place",
  slug: "place",
  venueId: "place",
  baseArea: "place",
  typicalSchedule: "place",
  description: "about",
  contactEmail: "about",
  contactPhone: "about",
  ownerId: "owner",
  participationMode: "vendors",
  vendorCapacity: "vendors",
  publicIntentListEnabled: "vendors",
  publicIntentNamesEnabled: "vendors",
  publicRosterEnabled: "vendors",
  vendorWorkflowMode: "vendors",
  vendorApplicationState: "vendors",
  imageUrl: "picture",
  imageFocalX: "picture",
  imageFocalY: "picture",
  websiteUrl: "picture",
  facebookUrl: "picture",
  instagramUrl: "picture",
  listingCommunityBadgeIds: "badges",
  complianceFlagged: "compliance",
  complianceNotes: "compliance",
};

const PARTICIPATION: { value: MarketDetails["participationMode"]; label: string }[] = [
  { value: "OPEN", label: "Mark as attending" },
  { value: "REQUEST_TO_JOIN", label: "Request to join" },
  { value: "INVITE_ONLY", label: "Invite only or juried" },
  { value: "CAPACITY_LIMITED", label: "Request to join, limited spots" },
];

const APPLICATION: { value: MarketDetails["vendorApplicationState"]; label: string }[] = [
  { value: "NOT_ACCEPTING", label: "Not taking applications" },
  { value: "OPEN", label: "Open" },
  { value: "WAITLIST", label: "Waitlist" },
  { value: "CLOSED", label: "Closed" },
];

const ROLE_WORDS: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", VOLUNTEER: "Volunteer", STAFF: "Staff" };

export function countChanges(before: MarketDetails, after: MarketDetails): number {
  return changedKeys(before, after).length;
}

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; "aria-required"?: boolean };

/** The web address input after its fixed prefix, with "From the name"; Field's id and aria props land on the input. */
function SlugInput({
  value,
  onChange,
  onFromName,
  ...control
}: ControlProps & { value: string; onChange: (value: string) => void; onFromName: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="hidden shrink-0 text-sm text-ash sm:inline">
        spokane.markets/markets/
      </span>
      <TextInput {...control} value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1" />
      <AdminButton size="sm" variant="outline" onClick={onFromName}>
        From the name
      </AdminButton>
    </div>
  );
}

function Group({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
      className="group min-w-0 border-t border-seam py-3 xl:break-inside-avoid"
    >
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-3 rounded-sm [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ash group-open:rotate-90" />
        <span className="font-text text-[15px]/[20px] font-semibold text-basalt">{title}</span>
        {summary && !open && <span className="min-w-0 truncate text-xs text-ash">{summary}</span>}
      </summary>
      <div className="space-y-4 pt-3 pb-2 pl-7">{children}</div>
    </details>
  );
}

/**
 * The market's details in collapsed groups: name and place, description and contact, owner and
 * team, vendors, picture and links, community badges, verification notes. Controlled: the screen
 * owns the values and the action bar that saves them.
 */
export function MarketDetailsForm({
  values,
  onChange,
  errors,
  options,
  ownerDisplay,
  team = [],
  scheduleCheck,
  onUseSchedule,
  scheduleSuggestion,
  allOpen = false,
  verificationLine,
}: {
  values: MarketDetails;
  onChange: (patch: Partial<MarketDetails>) => void;
  errors: DetailErrors;
  options: DetailsOptions;
  ownerDisplay?: string;
  team?: { name: string; role: string }[];
  /** The typical schedule check against the dates, when it found something. */
  scheduleCheck?: string | null;
  scheduleSuggestion?: string | null;
  onUseSchedule?: () => void;
  /** Every group open, as on a new market. */
  allOpen?: boolean;
  verificationLine?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState<Set<GroupKey>>(() =>
    allOpen ? new Set<GroupKey>(["place", "about", "owner", "vendors", "picture", "badges", "compliance"]) : new Set<GroupKey>(["place"])
  );
  const errorGroups = Object.keys(errors).map((k) => GROUP_OF[k as keyof MarketDetails]);
  const errorKey = errorGroups.join("|");
  const [seenErrors, setSeenErrors] = React.useState("");
  if (errorKey !== seenErrors) {
    setSeenErrors(errorKey);
    if (errorKey) setOpen((prev) => new Set([...prev, ...(errorKey.split("|") as GroupKey[])]));
  }

  const toggle = (key: GroupKey) => (isOpen: boolean) =>
    setOpen((prev) => {
      if (prev.has(key) === isOpen) return prev;
      const next = new Set(prev);
      if (isOpen) next.add(key);
      else next.delete(key);
      return next;
    });
  const set = <K extends keyof MarketDetails>(key: K) => (value: MarketDetails[K]) => onChange({ [key]: value } as Partial<MarketDetails>);
  const place = options.places.find((p) => p.id === values.venueId);
  const participation = PARTICIPATION.find((p) => p.value === values.participationMode)?.label ?? "";
  const badgeNames = options.badges.filter((b) => values.listingCommunityBadgeIds.includes(b.id)).map((b) => b.name);
  const links = [values.websiteUrl, values.facebookUrl, values.instagramUrl].filter(Boolean).length;

  return (
    <div className="max-w-[784px] xl:max-w-none xl:columns-2 xl:gap-x-10">
      <Group
        id="details-place"
        title="Name and place"
        summary={[values.name, place ? `${place.name}, ${place.city}` : null, values.typicalSchedule || null].filter(Boolean).join(". ")}
        open={open.has("place")}
        onToggle={toggle("place")}
      >
        <Field id="market-name" label="Name" required error={errors.name}>
          <TextInput value={values.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
        <Field id="market-slug" label="Web address" help="Changing this changes the public link." error={errors.slug} required>
          <SlugInput value={values.slug} onChange={set("slug")} onFromName={() => set("slug")(marketSlugFrom(values.name))} />
        </Field>
        <Field id="market-place" label="Home place" help="New dates are listed here. Archived places are not offered." error={errors.venueId} required>
          <SelectInput value={values.venueId} onChange={(e) => set("venueId")(e.target.value)}>
            <option value="">Pick a place</option>
            {!place && values.venueId && <option value={values.venueId}>The current place (archived)</option>}
            {options.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.city}
              </option>
            ))}
          </SelectInput>
        </Field>
        <FieldRow>
          <Field id="market-area" label="Neighborhood" error={errors.baseArea}>
            <SelectInput value={values.baseArea} onChange={(e) => set("baseArea")(e.target.value)}>
              <option value="">None</option>
              {options.neighborhoods.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="market-schedule" label="Typical schedule" help='Shown on the public page, e.g. "Saturdays, 10:00 am to 1:00 pm".' error={errors.typicalSchedule}>
            <TextInput value={values.typicalSchedule} onChange={(e) => set("typicalSchedule")(e.target.value)} />
          </Field>
        </FieldRow>
        {(scheduleCheck || (scheduleSuggestion && !values.typicalSchedule)) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <p className="text-honey-ink">{scheduleCheck ?? "No typical schedule yet."}</p>
            {scheduleSuggestion && onUseSchedule && (
              <AdminButton size="sm" variant="outline" onClick={onUseSchedule}>
                Use &ldquo;{scheduleSuggestion}&rdquo;
              </AdminButton>
            )}
          </div>
        )}
      </Group>

      <Group
        id="details-about"
        title="Description and contact"
        summary={values.description ? `${values.description.slice(0, 60)}${values.description.length > 60 ? "..." : ""}` : "No description"}
        open={open.has("about")}
        onToggle={toggle("about")}
      >
        <Field id="market-description" label="Description" error={errors.description}>
          <TextArea value={values.description} onChange={(e) => set("description")(e.target.value)} rows={4} className="max-w-[72ch]" />
        </Field>
        <FieldRow>
          <Field id="market-email" label="Contact email" error={errors.contactEmail}>
            <TextInput type="email" value={values.contactEmail} onChange={(e) => set("contactEmail")(e.target.value)} />
          </Field>
          <Field id="market-phone" label="Contact phone" error={errors.contactPhone}>
            <TextInput type="tel" value={values.contactPhone} onChange={(e) => set("contactPhone")(e.target.value)} />
          </Field>
        </FieldRow>
      </Group>

      <Group
        id="details-owner"
        title="Owner and team"
        summary={ownerDisplay && values.ownerId ? `Owner ${ownerDisplay}` : "No owner"}
        open={open.has("owner")}
        onToggle={toggle("owner")}
      >
        <div>
          <UserSearchInput
            id="market-owner"
            label="Owner"
            value={values.ownerId}
            displayValue={ownerDisplay}
            onChange={(id) => set("ownerId")(id)}
            placeholder="Search by name or email"
          />
          <p className="mt-1 text-xs text-ash">The owner and managers can edit a verified market and are told when it is verified.</p>
          {errors.ownerId && <p className="mt-1 text-xs text-ponderosa">{errors.ownerId}</p>}
        </div>
        {team.length > 0 ? (
          <div>
            <p className="font-text text-sm font-medium text-basalt">Team</p>
            <ul className="mt-1.5 divide-y divide-seam text-sm">
              {team.map((m) => (
                <li key={`${m.name}-${m.role}`} className="flex justify-between gap-3 py-1.5">
                  <span className="text-basalt">{m.name}</span>
                  <span className="text-ash">{ROLE_WORDS[m.role] ?? m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ash">Nobody else is on this market&apos;s team.</p>
        )}
      </Group>

      <Group
        id="details-vendors"
        title="Vendors"
        summary={`${participation}${values.participationMode === "CAPACITY_LIMITED" && values.vendorCapacity ? `, ${values.vendorCapacity} spots` : ""}`}
        open={open.has("vendors")}
        onToggle={toggle("vendors")}
      >
        <FieldRow>
          <Field id="market-participation" label="How vendors take part" error={errors.participationMode}>
            <SelectInput value={values.participationMode} onChange={(e) => set("participationMode")(e.target.value as MarketDetails["participationMode"])}>
              {PARTICIPATION.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="market-capacity" label="Spots" help="Only for limited spots." error={errors.vendorCapacity}>
            <TextInput
              type="number"
              min={0}
              inputMode="numeric"
              value={values.vendorCapacity ?? ""}
              onChange={(e) => set("vendorCapacity")(e.target.value === "" || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value))}
            />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field id="market-applications" label="Vendor applications" error={errors.vendorApplicationState}>
            <SelectInput value={values.vendorApplicationState} onChange={(e) => set("vendorApplicationState")(e.target.value as MarketDetails["vendorApplicationState"])}>
              {APPLICATION.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="market-workflow" label="Vendors sign up by" error={errors.vendorWorkflowMode}>
            <SelectInput value={values.vendorWorkflowMode} onChange={(e) => set("vendorWorkflowMode")(e.target.value as MarketDetails["vendorWorkflowMode"])}>
              <option value="INTENT_ONLY">Saying they will be there</option>
              <option value="BOTH">Saying so, or applying when applications are open</option>
            </SelectInput>
          </Field>
        </FieldRow>
        <div className="space-y-2">
          <CheckLine checked={values.publicIntentListEnabled} onChange={set("publicIntentListEnabled")}>
            Show the list of vendors who say they will be there
          </CheckLine>
          <CheckLine checked={values.publicIntentNamesEnabled} onChange={set("publicIntentNamesEnabled")} help="Off shows only how many.">
            Show their names
          </CheckLine>
          <CheckLine checked={values.publicRosterEnabled} onChange={set("publicRosterEnabled")}>
            Show the official vendor list
          </CheckLine>
        </div>
      </Group>

      <Group
        id="details-picture"
        title="Picture and links"
        summary={`${values.imageUrl ? "Picture" : "No picture"}, ${links === 0 ? "no links" : links === 1 ? "1 link" : `${links} links`}`}
        open={open.has("picture")}
        onToggle={toggle("picture")}
      >
        <div className="max-w-[400px]">
          <ImageUploadWithUrl value={values.imageUrl} onChange={set("imageUrl")} uploadType="market" label="Picture" aspectRatio="banner" />
          {errors.imageUrl && <p className="mt-1 text-xs text-ponderosa">{errors.imageUrl}</p>}
        </div>
        <Field id="market-website" label="Website" help="A bare address like kendallyards.com works." error={errors.websiteUrl}>
          <TextInput inputMode="url" value={values.websiteUrl} onChange={(e) => set("websiteUrl")(e.target.value)} />
        </Field>
        <FieldRow>
          <Field id="market-facebook" label="Facebook" help="Page name or link." error={errors.facebookUrl}>
            <TextInput value={values.facebookUrl} onChange={(e) => set("facebookUrl")(e.target.value)} />
          </Field>
          <Field id="market-instagram" label="Instagram" help="Handle or link." error={errors.instagramUrl}>
            <TextInput value={values.instagramUrl} onChange={(e) => set("instagramUrl")(e.target.value)} />
          </Field>
        </FieldRow>
      </Group>

      <Group
        id="details-badges"
        title="Community badges"
        summary={badgeNames.length ? badgeNames.join(", ") : "None"}
        open={open.has("badges")}
        onToggle={toggle("badges")}
      >
        <p className="text-sm text-ash">Badges the market chose for itself, shown on its public page.</p>
        {options.badges.length > 0 ? (
          <ChipToggles label="Community badges" options={options.badges.map((b) => ({ value: b.id, label: b.name }))} value={values.listingCommunityBadgeIds} onChange={set("listingCommunityBadgeIds")} />
        ) : (
          <p className="text-sm text-ash">No community badges exist yet.</p>
        )}
        {errors.listingCommunityBadgeIds && <p className="text-xs text-ponderosa">{errors.listingCommunityBadgeIds}</p>}
      </Group>

      <Group
        id="details-compliance"
        title="Verification and compliance"
        summary={values.complianceFlagged ? "Flagged for a closer look" : "Not flagged"}
        open={open.has("compliance")}
        onToggle={toggle("compliance")}
      >
        {verificationLine}
        <CheckLine checked={values.complianceFlagged} onChange={set("complianceFlagged")} help="Only you see this.">
          Flag for a closer look
        </CheckLine>
        <Field id="market-notes" label="Notes, only you see these" error={errors.complianceNotes}>
          <TextArea value={values.complianceNotes} onChange={(e) => set("complianceNotes")(e.target.value)} rows={3} className="max-w-[72ch]" />
        </Field>
      </Group>
    </div>
  );
}

/**
 * The action bar under the screen: what is unsaved, or when the details were saved, with Cancel
 * (Esc) and Save. With `leaving`, it asks whether to save before leaving instead.
 */
export function DetailsActionBar({
  changes,
  saving,
  onSave,
  onDiscard,
  saveLabel = "Save",
  canSave = changes > 0,
  leaving,
  onLeave,
  onStay,
  onCancel,
  savedAt = null,
  status,
}: {
  changes: number;
  saving: boolean;
  onSave: () => void;
  /** Drops the unsaved changes and stays on the page. */
  onDiscard?: () => void;
  saveLabel?: string;
  canSave?: boolean;
  leaving?: boolean;
  onLeave?: () => void;
  onStay?: () => void;
  onCancel?: () => void;
  savedAt?: number | null;
  status?: React.ReactNode;
}) {
  const savedText = useSavedText(savedAt);
  useShortcuts({ "mod+s": () => (canSave ? onSave() : undefined) });
  return (
    <SaveBar
      label="Save details"
      dirty={changes > 0}
      state={status ?? (changes > 0 ? unsavedText(changes) : (savedText ?? "No unsaved changes"))}
      leave={leaving && onLeave && onStay ? { onStay, onDiscard: onLeave, onSave, saving, saveLabel } : null}
    >
      {changes > 0 && onDiscard && (
        <AdminButton variant="quiet" onClick={onDiscard}>
          Discard
        </AdminButton>
      )}
      {onCancel && (
        <AdminButton variant="outline" keys="Esc" onClick={onCancel} className="max-md:hidden">
          Cancel
        </AdminButton>
      )}
      <AdminButton variant="ink" busy={saving} busyLabel="Saving" disabled={!canSave} onClick={onSave} keys="Ctrl+S">
        {saveLabel}
      </AdminButton>
    </SaveBar>
  );
}

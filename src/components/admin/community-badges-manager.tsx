"use client";

import * as React from "react";
import type { BadgeDefinition } from "@prisma/client";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { ActionRow } from "@/components/admin/rare/action-row";
import { TextArea, TextInput } from "@/components/admin/rare/controls";
import { EditDialog } from "@/components/admin/rare/edit-dialog";
import { badgeUse } from "@/components/admin/rare/words";
import { useAnnounce } from "@/components/admin/shell/live-region";

type CommunityBadgeRow = Pick<BadgeDefinition, "id" | "name" | "slug" | "description" | "icon" | "sortOrder"> & {
  _count: { vendorProfiles: number; markets: number };
};

type Draft = { name: string; slug: string; description: string; icon: string; sortOrder: number };

const EMPTY_DRAFT: Draft = { name: "", slug: "", description: "", icon: "", sortOrder: 100 };

/** The Community badges page: the list, read only, and one dialog to add or edit a badge. */
export function CommunityBadgesManager({ initialBadges }: { initialBadges: CommunityBadgeRow[] }) {
  const announce = useAnnounce();
  const [badges, setBadges] = React.useState(initialBadges);
  const [editing, setEditing] = React.useState<CommunityBadgeRow | null>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  function openFor(row: CommunityBadgeRow | null) {
    setEditing(row);
    setDraft(
      row
        ? { name: row.name, slug: row.slug, description: row.description ?? "", icon: row.icon ?? "", sortOrder: row.sortOrder }
        : EMPTY_DRAFT
    );
    setError(null);
    setOpen(true);
  }

  async function refresh() {
    const res = await fetch("/api/admin/community-badges");
    if (!res.ok) return;
    setBadges((await res.json()) as CommunityBadgeRow[]);
  }

  function done(message: string) {
    setOpen(false);
    toast.success(message);
    announce(message);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError("Give the badge a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/admin/community-badges/${editing.id}` : "/api/admin/community-badges", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, "Could not save the badge."));
      }
      await refresh();
      done(editing ? `Saved ${draft.name.trim()}.` : `Added ${draft.name.trim()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the badge.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community-badges/${editing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, "Could not delete the badge."));
      }
      await refresh();
      done(`Deleted ${editing.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the badge.");
    } finally {
      setRemoving(false);
    }
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <PageHeader
        title="Community badges"
        description="Badges vendors and markets can show on their pages, such as women-owned or veteran-owned."
        actions={
          <AdminButton variant="ink" onClick={() => openFor(null)} aria-haspopup="dialog">
            Add badge
          </AdminButton>
        }
      />

      {badges.length === 0 ? (
        <Empty>No community badges yet.</Empty>
      ) : (
        <List label="Community badges">
          {badges.map((row) => (
            <ActionRow
              key={row.id}
              rowKey={row.id}
              title={row.name}
              openLabel={`Edit ${row.name}`}
              onOpen={() => openFor(row)}
              hint="Edit"
              meta={
                <>
                  {row.description && <span className="block max-w-[72ch] text-ash">{row.description}</span>}
                  <span className="tabular-nums">{badgeUse(row._count.vendorProfiles, row._count.markets)}</span>
                </>
              }
            />
          ))}
        </List>
      )}

      <EditDialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${editing.name}` : "Add a badge"}
        formId="badge-form"
        onSubmit={save}
        saveLabel={editing ? "Save" : "Add"}
        saving={saving}
        error={error}
        removing={removing}
        remove={
          editing
            ? {
                label: "Delete badge",
                title: `Delete ${editing.name}?`,
                description:
                  editing._count.vendorProfiles + editing._count.markets > 0
                    ? `${badgeUse(editing._count.vendorProfiles, editing._count.markets)}. They lose the badge. This cannot be undone.`
                    : "No vendor or market uses it. This cannot be undone.",
                confirmLabel: "Delete badge",
                busyLabel: "Deleting",
                run: remove,
              }
            : undefined
        }
      >
        <Field id="badge-name" label="Name" required>
          <TextInput value={draft.name} placeholder="Women-owned" onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field id="badge-description" label="Description">
          <TextArea rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <FieldRow>
          <Field id="badge-slug" label="Short name" help="Made from the name when left empty.">
            <TextInput value={draft.slug} placeholder="women_owned" onChange={(e) => set("slug", e.target.value)} />
          </Field>
          <Field id="badge-icon" label="Icon" help="A Lucide icon name, such as Users.">
            <TextInput value={draft.icon} placeholder="Users" onChange={(e) => set("icon", e.target.value)} />
          </Field>
        </FieldRow>
        <Field id="badge-order" label="Order" help="Lower numbers show first.">
          <TextInput
            type="number"
            min={0}
            inputMode="numeric"
            className="w-32"
            value={draft.sortOrder}
            onChange={(e) => set("sortOrder", Number(e.target.value || 0))}
          />
        </Field>
      </EditDialog>
    </>
  );
}

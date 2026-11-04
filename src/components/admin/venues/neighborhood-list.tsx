"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Empty } from "@/components/admin/kit/empty";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { List, ListRow } from "@/components/admin/kit/list";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { getApiErrorMessage } from "@/lib/api-client";
import { slugify } from "@/lib/utils";
import type { NeighborhoodWithUse } from "@/lib/venues/place-data";
import { plural } from "@/lib/venues/words";
import { FieldSelect, TextInput } from "./controls";
import { viewHref } from "./views";

/** A web name the neighborhood API accepts: lowercase letters, numbers and hyphens. */
function webName(value: string): string {
  return slugify(value.replace(/['’]/g, ""));
}

async function send(url: string, method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true };
  const data: unknown = await res.json().catch(() => null);
  return { ok: false, status: res.status, error: getApiErrorMessage(data, "That did not save. Try again.") };
}

function Checkbox({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex min-h-6 cursor-pointer items-start gap-2 text-sm text-basalt">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt" />
      <span>{children}</span>
    </label>
  );
}

function useNotify() {
  const router = useRouter();
  const announce = useAnnounce();
  return React.useCallback(
    (message: string, ok: boolean) => {
      if (ok) toast(message);
      else toast.error(message);
      announce(message);
      if (ok) router.refresh();
    },
    [announce, router]
  );
}

function AddNeighborhood({ taken }: { taken: ReadonlySet<string> }) {
  const notify = useNotify();
  const [label, setLabel] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [isActive, setIsActive] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const web = slugTouched ? webName(slug) : webName(label);
  const clash = web && taken.has(web) ? `Another neighborhood already uses the web name ${web}.` : null;

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim() || !web || clash) return;
    setBusy(true);
    setError(null);
    try {
      const result = await send("/api/admin/neighborhoods", "POST", { label: label.trim(), slug: web, isActive });
      if (!result.ok) {
        setError(result.error);
        notify(result.error, false);
        return;
      }
      notify(`Added ${label.trim()}.${isActive ? " It is in the area filter now." : ""}`, true);
      setLabel("");
      setSlug("");
      setSlugTouched(false);
      setIsActive(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="add-neighborhood" title="Add a neighborhood">
      <form onSubmit={(e) => void add(e)} className="max-w-[640px] space-y-4">
        <FieldRow>
          <Field id="new-neighborhood-name" label="Name" required error={error ?? undefined}>
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field id="new-neighborhood-web" label="Web name" help="Stored on places, markets and subscriber choices." error={clash ?? undefined}>
            <TextInput
              value={slugTouched ? slug : web}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          </Field>
        </FieldRow>
        <Checkbox id="new-neighborhood-active" checked={isActive} onChange={setIsActive}>
          Show it in the public area filter and in subscriber choices now
        </Checkbox>
        <AdminButton type="submit" variant="ink" busy={busy} busyLabel="Adding" disabled={!label.trim() || !web || !!clash}>
          Add neighborhood
        </AdminButton>
      </form>
    </Section>
  );
}

function EditNeighborhood({ neighborhood, others, onClose }: { neighborhood: NeighborhoodWithUse; others: NeighborhoodWithUse[]; onClose: () => void }) {
  const notify = useNotify();
  const [label, setLabel] = React.useState(neighborhood.label);
  const [slug, setSlug] = React.useState(neighborhood.slug);
  const [isActive, setIsActive] = React.useState(neighborhood.isActive);
  const [moveTo, setMoveTo] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const web = webName(slug);
  const clash = web !== neighborhood.slug && others.some((n) => n.slug === web) ? `Another neighborhood already uses the web name ${web}.` : null;
  const used = neighborhood.venues + neighborhood.markets > 0;

  const save = async () => {
    if (!label.trim() || !web || clash) return;
    setBusy("save");
    setError(null);
    try {
      const result = await send(`/api/admin/neighborhoods/${neighborhood.id}`, "PATCH", { label: label.trim(), slug: web, isActive });
      if (!result.ok) {
        setError(result.error);
        notify(result.error, false);
        return;
      }
      notify(`Saved ${label.trim()}.`, true);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      const result = await send(`/api/admin/neighborhoods/${neighborhood.id}`, "DELETE", moveTo ? { reassignToSlug: moveTo } : {});
      if (!result.ok) {
        const message = result.status === 409 ? "Something still uses it. Pick the neighborhood to move it to, then delete." : result.error;
        setError(message);
        notify(message, false);
        return;
      }
      notify(`Deleted ${neighborhood.label}.`, true);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminDialog
      open
      onOpenChange={(open) => !open && onClose()}
      size="list"
      title={`Edit ${neighborhood.label}`}
      description={`${plural(neighborhood.venues, "place")} and ${plural(neighborhood.markets, "market")} are filed under it.`}
      footer={
        <>
          <AdminButton variant="outline" onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton variant="ink" busy={busy === "save"} busyLabel="Saving" disabled={!!busy || !label.trim() || !web || !!clash} onClick={() => void save()}>
            Save
          </AdminButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="edit-neighborhood-name" label="Name" required>
          <TextInput data-autofocus value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field id="edit-neighborhood-web" label="Web name" help="Places and markets follow a change to it; subscribers who picked it keep the old one." error={clash ?? undefined}>
          <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
        <Checkbox id="edit-neighborhood-active" checked={isActive} onChange={setIsActive}>
          In the public area filter and in subscriber choices
        </Checkbox>
        {error && <p className="text-sm text-ponderosa">{error}</p>}
        <section aria-labelledby="delete-neighborhood" className="space-y-3 border-t border-seam pt-4">
          <h3 id="delete-neighborhood" className="font-text text-[15px]/[20px] font-semibold text-basalt">
            Delete
          </h3>
          <p className="max-w-[60ch] text-sm text-ash">
            {used
              ? "Deleting moves its places and markets, and any subscribers who picked it, to the neighborhood you pick. Turning it off instead keeps them as they are."
              : "No place or market uses it. Subscribers who picked it move to the neighborhood you pick; without one, deleting is refused while any subscriber has it."}
          </p>
          <Field id="delete-neighborhood-move" label="Move what uses it to">
            <FieldSelect
              value={moveTo}
              onChange={(e) => {
                setMoveTo(e.target.value);
                setConfirming(false);
              }}
              className="max-w-[320px]"
            >
              <option value="">{used ? "Pick a neighborhood" : "Nothing to move"}</option>
              {others.map((n) => (
                <option key={n.slug} value={n.slug}>
                  {n.label}
                </option>
              ))}
            </FieldSelect>
          </Field>
          {confirming ? (
            <div role="group" aria-label="Confirm delete" className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-basalt">Delete {neighborhood.label} for good? This cannot be undone.</p>
              <AdminButton variant="danger" size="sm" busy={busy === "delete"} busyLabel="Deleting" disabled={!!busy} onClick={() => void remove()}>
                Delete
              </AdminButton>
              <AdminButton variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirming(false)}>
                Keep it
              </AdminButton>
            </div>
          ) : (
            <AdminButton variant="danger-outline" disabled={!!busy || (used && !moveTo)} onClick={() => setConfirming(true)}>
              {moveTo ? `Delete and move to ${others.find((n) => n.slug === moveTo)?.label ?? moveTo}` : "Delete"}
            </AdminButton>
          )}
        </section>
      </div>
    </AdminDialog>
  );
}

/**
 * Defining neighborhoods, next to assigning them. Every active neighborhood is a choice in the
 * public area filter and in subscriber area choices, so the list stays short. Opening a row
 * (Enter or a click) edits it; the row's web name is kept in the URL (`edit`).
 */
export function NeighborhoodList({ neighborhoods }: { neighborhoods: NeighborhoodWithUse[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const editing = neighborhoods.find((n) => n.slug === params.get("edit")) ?? null;
  const sorted = [...neighborhoods].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.label.localeCompare(b.label));
  const close = () => router.replace(viewHref("neighborhood-list"), { scroll: false });

  return (
    <div className="space-y-8">
      <p className="max-w-[72ch] text-[15px]/[23px] text-basalt">
        Each neighborhood here is a choice in the public area filter and in what subscribers can pick. Turning one off hides it there without changing the
        places filed under it.
      </p>
      {sorted.length === 0 ? (
        <Empty>No neighborhoods yet.</Empty>
      ) : (
        <List label="Neighborhoods">
          {sorted.map((n) => (
            <ListRow
              key={n.slug}
              rowKey={n.slug}
              href={viewHref("neighborhood-list", { edit: n.slug })}
              title={n.label}
              archived={!n.isActive}
              meta={
                <span className="tabular-nums">
                  {plural(n.venues, "place")}, {plural(n.markets, "market")}. Web name {n.slug}.{n.isActive ? "" : " Off: not in the area filter."}
                </span>
              }
            />
          ))}
        </List>
      )}
      <AddNeighborhood taken={new Set(neighborhoods.map((n) => n.slug))} />
      {editing && <EditNeighborhood key={editing.slug} neighborhood={editing} others={neighborhoods.filter((n) => n.slug !== editing.slug)} onClose={close} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { slugify } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api-client";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import { Segmented } from "@/components/admin/kit/segmented";
import { ActionRow } from "@/components/admin/rare/action-row";
import { TextInput } from "@/components/admin/rare/controls";
import { EditDialog } from "@/components/admin/rare/edit-dialog";
import { ListSection } from "@/components/admin/rare/list-section";
import { countWord } from "@/components/admin/rare/words";
import { useAnnounce } from "@/components/admin/shell/live-region";

type TagWithCount = { id: string; name: string; slug: string; _count: { events: number } };
type FeatureWithCount = { id: string; name: string; slug: string; icon: string | null; _count: { events: number } };
type Term = { id: string; name: string; slug: string; icon?: string | null; _count: { events: number } };

type Kind = "tag" | "feature";

const KIND = {
  tag: {
    api: "/api/admin/tags",
    one: "tag",
    title: "Tags",
    description: "What kind of event it is: farmers market, craft fair, flea market.",
    namePlaceholder: "Farmers market",
  },
  feature: {
    api: "/api/admin/features",
    one: "feature",
    title: "Features",
    description: "What is there: indoor, power for vendors, wifi.",
    namePlaceholder: "Indoor",
  },
} as const;

type Order = "name" | "used";

function eventsWord(count: number): string {
  return countWord(count, "event", "events");
}

function sortTerms<T extends Term>(terms: T[], order: Order): T[] {
  return [...terms].sort((a, b) =>
    order === "used" ? b._count.events - a._count.events || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)
  );
}

type Draft = { name: string; slug: string; icon: string; slugTouched: boolean };

function TermDialog({
  kind,
  term,
  open,
  onOpenChange,
  onSaved,
  onDeleted,
}: {
  kind: Kind;
  term: Term | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (term: Term) => void;
  onDeleted: (id: string) => void;
}) {
  const config = KIND[kind];
  const [draft, setDraft] = useState<Draft>({ name: "", slug: "", icon: "", slugTouched: false });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [openedFor, setOpenedFor] = useState<{ open: boolean; id?: string }>({ open: false });

  if (openedFor.open !== open || openedFor.id !== term?.id) {
    setOpenedFor({ open, id: term?.id });
    if (open) {
      setDraft({ name: term?.name ?? "", slug: term?.slug ?? "", icon: term?.icon ?? "", slugTouched: Boolean(term) });
      setError(null);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.name.trim();
    const slug = draft.slug.trim() || slugify(name);
    if (!name) {
      setError(`Give the ${config.one} a name.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, slug };
      if (kind === "feature") body.icon = draft.icon.trim() || undefined;
      const res = await fetch(term ? `${config.api}/${term.id}` : config.api, {
        method: term ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message ?? `Could not save the ${config.one}.`);
      onSaved({ ...(term ?? { _count: { events: 0 } }), ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not save the ${config.one}.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!term) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`${config.api}/${term.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, `Could not delete the ${config.one}.`));
      }
      onDeleted(term.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not delete the ${config.one}.`);
    } finally {
      setRemoving(false);
    }
  }

  const ids = { name: `${kind}-name`, slug: `${kind}-slug`, icon: `${kind}-icon` };

  return (
    <EditDialog
      open={open}
      onOpenChange={onOpenChange}
      title={term ? `Edit ${term.name}` : `Add a ${config.one}`}
      formId={`${kind}-form`}
      onSubmit={save}
      saveLabel={term ? "Save" : "Add"}
      saving={saving}
      error={error}
      removing={removing}
      remove={
        term
          ? {
              label: `Delete ${config.one}`,
              title: `Delete ${term.name}?`,
              description:
                term._count.events > 0
                  ? `${eventsWord(term._count.events)} ${term._count.events === 1 ? "loses" : "lose"} this ${config.one}. This cannot be undone.`
                  : `No event uses this ${config.one}. This cannot be undone.`,
              confirmLabel: `Delete ${config.one}`,
              busyLabel: "Deleting",
              run: remove,
            }
          : undefined
      }
    >
      <Field id={ids.name} label="Name" required>
        <TextInput
          value={draft.name}
          placeholder={config.namePlaceholder}
          onChange={(e) => {
            const name = e.target.value;
            setDraft((d) => ({ ...d, name, slug: d.slugTouched ? d.slug : slugify(name) }));
          }}
        />
      </Field>
      <FieldRow>
        <Field id={ids.slug} label="Web address" help="Used in filter links. Made from the name unless you change it.">
          <TextInput value={draft.slug} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value, slugTouched: true }))} />
        </Field>
        {kind === "feature" ? (
          <Field id={ids.icon} label="Icon" help="One emoji, shown before the name.">
            <TextInput value={draft.icon} maxLength={8} onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))} />
          </Field>
        ) : (
          <span />
        )}
      </FieldRow>
    </EditDialog>
  );
}

function TermSection<T extends Term>({
  kind,
  terms,
  order,
  onChange,
}: {
  kind: Kind;
  terms: T[];
  order: Order;
  onChange: (terms: Term[]) => void;
}) {
  const router = useRouter();
  const announce = useAnnounce();
  const config = KIND[kind];
  const [editing, setEditing] = useState<Term | null>(null);
  const [open, setOpen] = useState(false);

  const say = (message: string) => {
    toast.success(message);
    announce(message);
  };

  return (
    <ListSection
      id={`${kind}s`}
      title={config.title}
      description={config.description}
      action={
        <AdminButton
          variant="outline"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add {config.one}
        </AdminButton>
      }
    >
      {terms.length === 0 ? (
        <Empty className="py-4">No {config.one}s yet.</Empty>
      ) : (
        <List label={config.title}>
          {sortTerms(terms, order).map((term) => (
            <ActionRow
              key={term.id}
              rowKey={term.id}
              title={
                <>
                  {term.icon && (
                    <span aria-hidden="true" className="mr-1.5">
                      {term.icon}
                    </span>
                  )}
                  {term.name}
                </>
              }
              openLabel={`Edit ${term.name}`}
              onOpen={() => {
                setEditing(term);
                setOpen(true);
              }}
              hint="Edit"
              meta={
                <span className="tabular-nums">
                  {eventsWord(term._count.events)}, web address {term.slug}
                </span>
              }
            />
          ))}
        </List>
      )}
      <TermDialog
        kind={kind}
        term={editing}
        open={open}
        onOpenChange={setOpen}
        onSaved={(saved) => {
          const exists = terms.some((t) => t.id === saved.id);
          onChange(exists ? terms.map((t) => (t.id === saved.id ? { ...t, ...saved } : t)) : [...terms, saved]);
          setOpen(false);
          say(exists ? `Saved ${saved.name}.` : `Added ${saved.name}.`);
          router.refresh();
        }}
        onDeleted={(id) => {
          const name = terms.find((t) => t.id === id)?.name ?? `The ${config.one}`;
          onChange(terms.filter((t) => t.id !== id));
          setOpen(false);
          say(`Deleted ${name}.`);
          router.refresh();
        }}
      />
    </ListSection>
  );
}

interface CategoriesManagerProps {
  initialTags: TagWithCount[];
  initialFeatures: FeatureWithCount[];
}

/** Tags and features side by side on wide screens, each with an add button and a list that opens an edit dialog. */
export function CategoriesManager({ initialTags, initialFeatures }: CategoriesManagerProps) {
  const [tags, setTags] = useState<Term[]>(initialTags);
  const [features, setFeatures] = useState<Term[]>(initialFeatures);
  const [order, setOrder] = useState<Order>("name");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="font-text text-sm text-ash">
          Order
        </span>
        <Segmented<Order>
          label="Order"
          value={order}
          onChange={setOrder}
          options={[
            { value: "name", label: "A to Z" },
            { value: "used", label: "Most used" },
          ]}
        />
      </div>
      <div className="grid gap-x-8 gap-y-10 xl:grid-cols-2">
        <TermSection kind="tag" terms={tags} order={order} onChange={setTags} />
        <TermSection kind="feature" terms={features} order={order} onChange={setFeatures} />
      </div>
    </div>
  );
}

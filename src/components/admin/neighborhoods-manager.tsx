"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowUpAZ, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteButton } from "@/components/admin/action-buttons";
import { slugify } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api-client";

type NeighborhoodWithCount = {
  id: string;
  slug: string;
  label: string;
  isActive: boolean;
  _count: { markets: number; venues: number };
};

interface NeighborhoodsManagerProps {
  initialNeighborhoods: NeighborhoodWithCount[];
}

export function NeighborhoodsManager({
  initialNeighborhoods,
}: NeighborhoodsManagerProps) {
  const router = useRouter();
  const [neighborhoods, setNeighborhoods] = useState(initialNeighborhoods);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = [...neighborhoods].sort((a, b) =>
    sortDir === "asc"
      ? a.label.localeCompare(b.label)
      : b.label.localeCompare(a.label)
  );

  const addNeighborhood = async () => {
    const nextLabel = label.trim();
    const nextSlug = (slug.trim() || slugify(nextLabel)).toLowerCase();
    if (!nextLabel || !nextSlug) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/neighborhoods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: nextLabel,
          slug: nextSlug,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to add neighborhood");
      }
      const created = await res.json();
      setNeighborhoods((prev) => [...prev, { ...created, _count: { markets: 0, venues: 0 } }]);
      setLabel("");
      setSlug("");
      setIsActive(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add neighborhood");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (row: NeighborhoodWithCount) => {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditSlug(row.slug);
    setEditIsActive(row.isActive);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditSlug("");
    setEditIsActive(true);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const nextLabel = editLabel.trim();
    const nextSlug = (editSlug.trim() || slugify(nextLabel)).toLowerCase();
    if (!nextLabel || !nextSlug) return;
    setEditingSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/neighborhoods/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: nextLabel,
          slug: nextSlug,
          isActive: editIsActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to update neighborhood");
      }
      const updated = await res.json();
      setNeighborhoods((prev) =>
        prev.map((entry) =>
          entry.id === editingId ? { ...entry, ...updated } : entry
        )
      );
      cancelEdit();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update neighborhood"
      );
    } finally {
      setEditingSubmitting(false);
    }
  };

  const removeNeighborhood = async (row: NeighborhoodWithCount) => {
    const res = await fetch(`/api/admin/neighborhoods/${row.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (res.status === 409) {
      const conflict = (await res.json()) as {
        error: string;
        usage: {
          venues: number;
          markets: number;
          subscribers: number;
          savedFilters: number;
        };
      };
      const promptMessage = [
        `${getApiErrorMessage(conflict, "This neighborhood is still in use")}`,
        `Usage: venues=${conflict.usage.venues}, markets=${conflict.usage.markets}, subscribers=${conflict.usage.subscribers}, savedFilters=${conflict.usage.savedFilters}.`,
        "Enter replacement slug to reassign these references before delete:",
      ].join("\n");
      const replacement = window.prompt(promptMessage);
      if (!replacement) return;

      const retry = await fetch(`/api/admin/neighborhoods/${row.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignToSlug: replacement.trim() }),
      });
      if (!retry.ok) {
        const data = await retry.json();
        throw new Error(getApiErrorMessage(data, "Failed to delete neighborhood"));
      }
    } else if (!res.ok) {
      const data = await res.json();
      throw new Error(getApiErrorMessage(data, "Failed to delete neighborhood"));
    }

    setNeighborhoods((prev) => prev.filter((entry) => entry.id !== row.id));
    router.refresh();
  };

  return (
    <section className="rounded-lg border border-border p-6">
      <h2 className="text-xl font-semibold">Neighborhood definitions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Slugs are stored on venues and markets. Keep slug changes intentional.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Label"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (!slug) setSlug(slugify(e.target.value));
          }}
          className="w-60"
        />
        <Input
          placeholder="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="w-44"
        />
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
        <Button onClick={addNeighborhood} disabled={submitting || !label.trim()}>
          {submitting ? "Adding..." : "Add"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
          className="inline-flex items-center gap-1.5"
        >
          {sortDir === "asc" ? (
            <>
              <ArrowUpAZ className="h-4 w-4" />
              A-Z
            </>
          ) : (
            <>
              <ArrowDownAZ className="h-4 w-4" />
              Z-A
            </>
          )}
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <ul className="mt-4 space-y-2">
        {sorted.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            {editingId === row.id ? (
              <>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input
                    value={editLabel}
                    onChange={(e) => {
                      setEditLabel(e.target.value);
                      if (!editSlug) setEditSlug(slugify(e.target.value));
                    }}
                    className="h-8 w-52"
                    placeholder="Label"
                  />
                  <Input
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    className="h-8 w-40"
                    placeholder="slug"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                    />
                    Active
                  </label>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={cancelEdit}
                    disabled={editingSubmitting}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEdit}
                    disabled={!editLabel.trim() || editingSubmitting}
                  >
                    {editingSubmitting ? "Saving..." : "Save"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="text-left"
                >
                  <p className="font-medium">
                    {row.label}
                    {!row.isActive && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (inactive)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    slug: {row.slug} · venues:{" "}
                    {row._count.venues} · markets: {row._count.markets}
                  </p>
                </button>
                <div className="flex items-center gap-2" data-row-action>
                  <DeleteButton
                    action={async () => removeNeighborhood(row)}
                    title="Delete neighborhood"
                    description={`Delete "${row.label}"? If in use, you'll be prompted to reassign references.`}
                    iconOnly
                  />
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

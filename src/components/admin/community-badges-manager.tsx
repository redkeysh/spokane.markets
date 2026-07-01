"use client";

import * as React from "react";
import type { BadgeDefinition } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getApiErrorMessage } from "@/lib/api-client";

type CommunityBadgeRow = Pick<
  BadgeDefinition,
  "id" | "name" | "slug" | "description" | "icon" | "sortOrder"
> & {
  _count: { vendorProfiles: number; markets: number };
};

export function CommunityBadgesManager({
  initialBadges,
}: {
  initialBadges: CommunityBadgeRow[];
}) {
  const [badges, setBadges] = React.useState(initialBadges);
  const [newBadge, setNewBadge] = React.useState({
    name: "",
    slug: "",
    description: "",
    icon: "",
    sortOrder: 100,
  });
  const [error, setError] = React.useState<string | null>(null);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  async function refresh() {
    const res = await fetch("/api/admin/community-badges");
    if (!res.ok) return;
    const rows = (await res.json()) as CommunityBadgeRow[];
    setBadges(rows);
  }

  async function createBadge() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/community-badges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBadge),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, "Failed to create badge"));
      }
      setNewBadge({ name: "", slug: "", description: "", icon: "", sortOrder: 100 });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create badge");
    } finally {
      setCreating(false);
    }
  }

  async function updateBadge(row: CommunityBadgeRow) {
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community-badges/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          slug: row.slug,
          description: row.description ?? "",
          icon: row.icon ?? "",
          sortOrder: row.sortOrder,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, "Failed to update badge"));
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update badge");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteBadge(id: string) {
    if (!confirm("Delete this badge definition?")) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/community-badges/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(body, "Failed to delete badge"));
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete badge");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add Community Badge</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={newBadge.name}
              onChange={(e) =>
                setNewBadge((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Women-owned"
            />
          </div>
          <div className="space-y-2">
            <Label>Slug (optional)</Label>
            <Input
              value={newBadge.slug}
              onChange={(e) =>
                setNewBadge((p) => ({ ...p, slug: e.target.value }))
              }
              placeholder="women_owned"
            />
          </div>
          <div className="space-y-2">
            <Label>Icon (Lucide name)</Label>
            <Input
              value={newBadge.icon}
              onChange={(e) =>
                setNewBadge((p) => ({ ...p, icon: e.target.value }))
              }
              placeholder="Users"
            />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input
              type="number"
              min={0}
              value={newBadge.sortOrder}
              onChange={(e) =>
                setNewBadge((p) => ({
                  ...p,
                  sortOrder: Number(e.target.value || 0),
                }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              value={newBadge.description}
              onChange={(e) =>
                setNewBadge((p) => ({ ...p, description: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              onClick={createBadge}
              disabled={creating || !newBadge.name.trim()}
            >
              {creating ? "Adding..." : "Add badge"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Community Badges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {badges.map((row) => (
            <div key={row.id} className="rounded-lg border border-border p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={row.name}
                  onChange={(e) =>
                    setBadges((prev) =>
                      prev.map((b) =>
                        b.id === row.id ? { ...b, name: e.target.value } : b
                      )
                    )
                  }
                  placeholder="Name"
                />
                <Input
                  value={row.slug}
                  onChange={(e) =>
                    setBadges((prev) =>
                      prev.map((b) =>
                        b.id === row.id ? { ...b, slug: e.target.value } : b
                      )
                    )
                  }
                  placeholder="Slug"
                />
                <Input
                  value={row.icon ?? ""}
                  onChange={(e) =>
                    setBadges((prev) =>
                      prev.map((b) =>
                        b.id === row.id ? { ...b, icon: e.target.value } : b
                      )
                    )
                  }
                  placeholder="Icon"
                />
                <Input
                  type="number"
                  min={0}
                  value={row.sortOrder}
                  onChange={(e) =>
                    setBadges((prev) =>
                      prev.map((b) =>
                        b.id === row.id
                          ? { ...b, sortOrder: Number(e.target.value || 0) }
                          : b
                      )
                    )
                  }
                  placeholder="Sort order"
                />
                <div className="sm:col-span-2">
                  <Textarea
                    rows={2}
                    value={row.description ?? ""}
                    onChange={(e) =>
                      setBadges((prev) =>
                        prev.map((b) =>
                          b.id === row.id
                            ? { ...b, description: e.target.value }
                            : b
                        )
                      )
                    }
                    placeholder="Description"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Used by {row._count.vendorProfiles} vendors and {row._count.markets} markets.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => updateBadge(row)}
                  disabled={savingId === row.id}
                >
                  {savingId === row.id ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => deleteBadge(row.id)}
                  disabled={savingId === row.id}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {badges.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No community badge definitions yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

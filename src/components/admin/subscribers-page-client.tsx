"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscriberForm } from "./subscriber-form";
import { SubscriberDeleteButton } from "./subscriber-delete-button";
import { formatDate } from "@/lib/utils";
import { Plus, Pencil } from "lucide-react";
import type { NeighborhoodOption } from "@/lib/neighborhoods-config";

interface Subscriber {
  id: string;
  email: string;
  areas: string[];
  createdAt: Date;
}

interface SubscribersPageClientProps {
  subscribers: Subscriber[];
  neighborhoods: NeighborhoodOption[];
  total: number;
}

export function SubscribersPageClient({
  subscribers,
  neighborhoods,
  total,
}: SubscribersPageClientProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscriber | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(sub: Subscriber) {
    setEditing(sub);
    setFormOpen(true);
  }

  function handleFormClose(open: boolean) {
    setFormOpen(open);
    if (!open) setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Subscribers</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {total} total
          </span>
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Subscriber
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">Email</th>
              <th className="p-3 text-left font-medium">Areas</th>
              <th className="p-3 text-left font-medium">Joined</th>
              <th className="w-28 p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subscribers.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="p-6 text-center text-muted-foreground"
                >
                  No subscribers yet. Add one or they&apos;ll sign up via the
                  newsletter form on the site.
                </td>
              </tr>
            ) : (
              subscribers.map((sub) => (
                <tr key={sub.id} className="hover:bg-muted/30">
                  <td className="p-3 font-medium">{sub.email}</td>
                  <td className="p-3">
                    {sub.areas.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {sub.areas.map((area) => (
                          <Badge key={area} variant="secondary">
                            {area}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">All areas</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(sub.createdAt)}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEdit(sub)}
                        aria-label={`Edit ${sub.email}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <SubscriberDeleteButton id={sub.id} email={sub.email} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <SubscriberForm
        open={formOpen}
        onOpenChange={handleFormClose}
        neighborhoods={neighborhoods}
        initialData={
          editing
            ? { id: editing.id, email: editing.email, areas: editing.areas }
            : undefined
        }
      />
    </div>
  );
}

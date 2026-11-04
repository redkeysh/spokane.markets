"use client";

import { useState } from "react";
import type { NeighborhoodOption } from "@/lib/neighborhoods-config";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { List } from "@/components/admin/kit/list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { ActionRow } from "@/components/admin/rare/action-row";
import { areaWords } from "@/components/admin/rare/words";
import { SubscriberForm } from "./subscriber-form";

interface Subscriber {
  id: string;
  email: string;
  areas: string[];
  /** "Nov 3, 2026" */
  joined: string;
}

interface SubscribersPageClientProps {
  subscribers: Subscriber[];
  neighborhoods: NeighborhoodOption[];
}

/** The header, the list and the add or edit dialog of the Subscribers page. */
export function SubscribersPageClient({ subscribers, neighborhoods }: SubscribersPageClientProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscriber | null>(null);
  const labels = new Map(neighborhoods.map((n) => [n.value, n.label]));

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(sub: Subscriber) {
    setEditing(sub);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Subscribers"
        description="People who get the weekly email. They sign up on the site, or you add them here."
        actions={
          <AdminButton variant="ink" onClick={openCreate} aria-haspopup="dialog">
            Add subscriber
          </AdminButton>
        }
      />

      {subscribers.length === 0 ? (
        <Empty detail="People sign up with the newsletter form on the site.">No one is subscribed yet.</Empty>
      ) : (
        <List label="Subscribers">
          {subscribers.map((sub) => (
            <ActionRow
              key={sub.id}
              rowKey={sub.id}
              title={sub.email}
              openLabel={`Edit ${sub.email}`}
              onOpen={() => openEdit(sub)}
              hint="Edit"
              meta={
                <span className="tabular-nums">
                  {areaWords(sub.areas, labels)}, joined {sub.joined}
                </span>
              }
            />
          ))}
        </List>
      )}

      <SubscriberForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        neighborhoods={neighborhoods}
        initialData={editing ? { id: editing.id, email: editing.email, areas: editing.areas } : undefined}
      />
    </>
  );
}

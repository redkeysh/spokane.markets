"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SideSection } from "../editor-shell";
import { LinkButton } from "../controls";
import { useEditorForm } from "../form-context";

/** Less frequent things to do with the record, each one line. */
export function Also({
  onPasteJson,
  onArchive,
  onRestore,
}: {
  onPasteJson?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const { record, mode } = useEditorForm();
  const id = record.id;
  const linkClass = "inline-flex min-h-6 items-center rounded-sm text-sm text-lilac underline-offset-4 hover:underline";
  const items: ReactNode[] = [];
  if (mode === "event" && id && !record.archived) {
    if (record.status === "PUBLISHED") {
      items.push(
        <Link key="feature" href={`/admin/promotions/new?eventId=${encodeURIComponent(id)}`} className={linkClass}>
          Feature on the homepage
        </Link>
      );
    }
    items.push(
      <Link key="graphic" href={`/admin/marketing/asset-studio/new?eventId=${encodeURIComponent(id)}`} className={linkClass}>
        Make a graphic
      </Link>,
      <Link key="copy" href={`/admin/events/new?copy=${encodeURIComponent(id)}`} className={linkClass}>
        Copy as next date
      </Link>
    );
  }
  if (mode === "new" && onPasteJson) items.push(<LinkButton key="json" onClick={onPasteJson}>Paste from JSON</LinkButton>);
  if (onArchive) items.push(<LinkButton key="archive" onClick={onArchive} className="text-ponderosa">Archive</LinkButton>);
  if (onRestore) items.push(<LinkButton key="restore" onClick={onRestore}>Restore</LinkButton>);
  if (items.length === 0) return null;
  return (
    <SideSection title="Also">
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </SideSection>
  );
}

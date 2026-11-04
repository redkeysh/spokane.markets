"use client";

import Link from "next/link";
import { STATUS_MARKS, type MarkStatus } from "@/components/admin/kit/status-mark";
import { SideSection } from "../editor-shell";
import { useEditorForm } from "../form-context";

/** Other listings on the same day at the same place that look like this event, with "Compare in To do". */
export function Twins() {
  const { context, record } = useEditorForm();
  return (
    <SideSection title="Twins">
      {context.twins.length === 0 ? (
        <p className="text-sm text-ash">None found</p>
      ) : (
        <ul className="space-y-3">
          {context.twins.map((twin) => (
            <li key={twin.id} className="text-sm">
              <Link href={`/admin/events/${twin.id}`} className="rounded-sm font-medium text-lilac underline-offset-4 hover:underline">
                {twin.title}
              </Link>
              <p className="mt-0.5 text-xs text-ash tabular-nums">
                {twin.dateLabel}, {STATUS_MARKS[twin.status as MarkStatus]?.word ?? twin.status}
              </p>
              {twin.compareHref && record.status !== "PUBLISHED" && (
                <Link href={twin.compareHref} className="mt-0.5 inline-flex min-h-6 items-center rounded-sm text-xs font-medium text-lilac underline-offset-4 hover:underline">
                  Compare in To do
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </SideSection>
  );
}

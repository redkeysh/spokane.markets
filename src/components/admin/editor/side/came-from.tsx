"use client";

import Link from "next/link";
import { SideSection } from "../editor-shell";
import { useEditorForm } from "../form-context";

/** Where the event came from: an import, the public form, an organizer account, or by hand. */
export function CameFrom() {
  const { context } = useEditorForm();
  const origin = context.origin;
  if (!origin) return null;
  return (
    <SideSection title="Came from">
      <p className="text-sm text-basalt">
        {origin.href ? (
          <Link href={origin.href} className="rounded-sm text-lilac underline-offset-4 hover:underline">
            {origin.label}
          </Link>
        ) : (
          origin.label
        )}
      </p>
      {origin.detail && <p className="mt-0.5 text-xs text-ash tabular-nums">{origin.detail}</p>}
    </SideSection>
  );
}

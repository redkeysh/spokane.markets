"use client";

import { AdminButton } from "@/components/admin/kit/button";

/** Rendered inside the admin shell, so the top bar and rail stay. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-[72ch] py-8">
      <h1 className="font-display text-2xl/[30px] font-bold text-basalt">Something went wrong loading this page.</h1>
      <div className="mt-4">
        <AdminButton variant="ink" onClick={reset}>
          Try again
        </AdminButton>
      </div>
      <details className="mt-6">
        <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium text-lilac">Details</summary>
        <p className="mt-2 text-sm break-words text-ash">{error.message || "No message was given."}</p>
        {error.digest && <p className="mt-1 text-xs text-ash tabular-nums">Reference {error.digest}</p>}
      </details>
    </div>
  );
}

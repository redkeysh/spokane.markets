import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacyInboxHref } from "@/lib/admin/inbox/model";

export const metadata: Metadata = { title: "From the public: reports" };

/** Reports live in From the public, with severity and escalation under Triage details; the status carries over. */
export default async function ReportsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  redirect(legacyInboxHref("reports", await searchParams));
}

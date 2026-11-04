import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacyInboxHref } from "@/lib/admin/inbox/model";

export const metadata: Metadata = { title: "From the public: applications" };

/** Applications live in From the public; the status carries over. */
export default async function ApplicationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  redirect(legacyInboxHref("applications", await searchParams));
}

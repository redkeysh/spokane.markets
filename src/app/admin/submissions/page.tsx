import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacySubmissionsHref } from "@/lib/admin/inbox/model";

export const metadata: Metadata = { title: "From the public: sent from the site" };

/** Waiting submissions are decided on To do; decided ones are in From the public. */
export default async function SubmissionsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  redirect(legacySubmissionsHref(await searchParams));
}

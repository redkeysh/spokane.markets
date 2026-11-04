import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacyInboxHref } from "@/lib/admin/inbox/model";

export const metadata: Metadata = { title: "From the public: photos" };

/** Photos live in From the public as a grid; the status and person filters carry over. */
export default async function PhotosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  redirect(legacyInboxHref("photos", await searchParams));
}

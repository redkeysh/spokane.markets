import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { legacyInboxHref } from "@/lib/admin/inbox/model";

export const metadata: Metadata = { title: "From the public: reviews" };

/** Reviews live in From the public; the status and person filters carry over. */
export default async function ReviewsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  redirect(legacyInboxHref("reviews", await searchParams));
}

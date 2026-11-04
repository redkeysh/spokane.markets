import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "From the public" };

/** Everything waiting from the public is the To do lane "From the public". */
export default function QueuesRedirect(): never {
  redirect("/admin?lane=public");
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "To do" };

/** Redirects to To do. */
export default function SystemHealthRedirect(): never {
  redirect("/admin");
}

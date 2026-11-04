import { redirect } from "next/navigation";

export default function AdminSettingsPage(): never {
  redirect("/admin/site");
}

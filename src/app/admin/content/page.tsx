import { redirect } from "next/navigation";

export default function AdminContentPage(): never {
  redirect("/admin/site");
}

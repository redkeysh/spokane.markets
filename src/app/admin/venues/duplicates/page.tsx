import { redirect } from "next/navigation";

export default function VenueDuplicatesRedirect() {
  redirect("/admin/venues?view=duplicates");
}

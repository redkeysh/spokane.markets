import { redirect } from "next/navigation";

export default function NeighborhoodsRedirect() {
  redirect("/admin/venues?view=neighborhood-list");
}

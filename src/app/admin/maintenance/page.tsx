import { redirect } from "next/navigation";

export default function AdminMaintenancePage(): never {
  redirect("/admin/site#maintenance");
}

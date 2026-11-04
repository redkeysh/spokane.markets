import { redirect } from "next/navigation";

export default async function EditVendorPage({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  redirect(`/admin/vendors/${encodeURIComponent(id)}`);
}

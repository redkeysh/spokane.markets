import { redirect } from "next/navigation";

export default async function EditVenueRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/venues/${encodeURIComponent(id)}`);
}

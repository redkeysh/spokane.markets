import { redirect } from "next/navigation";

export default async function EditMarketRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/markets/${id}`);
}

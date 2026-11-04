import { redirect } from "next/navigation";

/** The old editor address: forwards to /admin/events/[id], keeping the query. */
export default async function EditEventRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, one);
  }
  const search = query.toString();
  redirect(`/admin/events/${encodeURIComponent(id)}${search ? `?${search}` : ""}`);
}

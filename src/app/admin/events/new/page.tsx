import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { EventEditor } from "@/components/admin/editor/event-editor";
import { loadNewEditor, type SearchParams } from "@/components/admin/editor/load";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const props = await loadNewEditor(params);
  return <EventEditor key={props.context.copiedFrom?.id ?? "new"} {...props} />;
}

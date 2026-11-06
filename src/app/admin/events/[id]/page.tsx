import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { adminRecordTitle } from "@/lib/admin/record-title";
import { db } from "@/lib/db";
import { EventEditor } from "@/components/admin/editor/event-editor";
import { loadEventEditor, type SearchParams } from "@/components/admin/editor/load";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return adminRecordTitle("Event", async () => (await db.event.findUnique({ where: { id }, select: { title: true } }))?.title);
}

export default async function EventEditorPage({ params, searchParams }: Props) {
  const session = await requireAdmin();
  const { id } = await params;
  const props = await loadEventEditor(id, await searchParams, session.user.id);
  if (!props) notFound();
  return <EventEditor key={id} {...props} />;
}

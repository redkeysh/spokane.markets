import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { EventEditor } from "@/components/admin/editor/event-editor";
import { loadEventEditor, type SearchParams } from "@/components/admin/editor/load";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const event = await db.event.findUnique({ where: { id }, select: { title: true } });
  return { title: event?.title.trim() || "Event not found" };
}

export default async function EventEditorPage({ params, searchParams }: Props) {
  const session = await requireAdmin();
  const { id } = await params;
  const props = await loadEventEditor(id, await searchParams, session.user.id);
  if (!props) notFound();
  return <EventEditor key={id} {...props} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { EventEditor } from "@/components/admin/editor/event-editor";
import { loadSubmissionEditor, type SearchParams } from "@/components/admin/editor/load";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const submission = await db.submission.findUnique({ where: { id }, select: { eventTitle: true } });
  return { title: submission ? `Sent from the site: ${submission.eventTitle.trim()}` : "Submission not found" };
}

/** A pending submission opens in the event editor bound to it; a decided one is a read-only record. */
export default async function SubmissionPage({ params, searchParams }: Props) {
  const session = await requireAdmin();
  const { id } = await params;
  const props = await loadSubmissionEditor(id, await searchParams, session.user.id);
  if (!props) notFound();
  return <EventEditor key={`${id}:${props.context.submission?.status}`} {...props} />;
}

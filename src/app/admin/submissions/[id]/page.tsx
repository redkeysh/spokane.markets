import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { adminRecordTitle } from "@/lib/admin/record-title";
import { db } from "@/lib/db";
import { EventEditor } from "@/components/admin/editor/event-editor";
import { loadSubmissionEditor, type SearchParams } from "@/components/admin/editor/load";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return adminRecordTitle("Sent from the site", async () => {
    const submission = await db.submission.findUnique({ where: { id }, select: { eventTitle: true } });
    return submission ? `Sent from the site: ${submission.eventTitle.trim()}` : null;
  });
}

/** A pending submission opens in the event editor bound to it; a decided one is a read-only record. */
export default async function SubmissionPage({ params, searchParams }: Props) {
  const session = await requireAdmin();
  const { id } = await params;
  const props = await loadSubmissionEditor(id, await searchParams, session.user.id);
  if (!props) notFound();
  return <EventEditor key={`${id}:${props.context.submission?.status}`} {...props} />;
}

import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { loadTodoData } from "@/components/admin/todo/load";
import { TodoScreen } from "@/components/admin/todo/todo-screen";

/** The admin layout's title template applies to child segments only, so this page names itself in full. */
export const metadata: Metadata = { title: { absolute: "To do, Spokane Markets admin" } };

export const dynamic = "force-dynamic";

/**
 * To do: every waiting row filed into decisions by weekend, opening on this weekend's brief.
 * The open lane, the filters and the phone's open decision live in the URL (?week=, ?lane=,
 * ?show=, ?area=, ?d=).
 */
export default async function TodoPage() {
  const session = await requireAdmin();
  const data = await loadTodoData(session.user.id);
  return <TodoScreen data={data} />;
}

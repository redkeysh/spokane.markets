import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-utils";
import { PageHeader } from "@/components/admin/kit/page-header";
import { adminButtonClass } from "@/components/admin/kit/button";
import { HistoryFilters } from "@/components/admin/history/history-filters";
import { HistoryView } from "@/components/admin/history/history-view";
import { emptyHistoryMessage, historyFiltersActive, historyQueryString, parseHistoryFilters } from "./history-shared";
import { historyPeople, loadHistoryPage } from "./history-query";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const filters = parseHistoryFilters(await searchParams);
  const [page, people] = await Promise.all([loadHistoryPage(filters, session.user.id), historyPeople(session.user.id)]);

  const query = historyQueryString(filters);
  const whoLabel =
    filters.who === "you"
      ? "you"
      : filters.who === "tokens"
        ? "API tokens"
        : (people.find((p) => p.id === filters.who)?.label ?? null);
  const exportHref = `/admin/audit-log/export${query ? `?${query}` : ""}`;

  return (
    <div className="mx-auto w-full max-w-[1184px] space-y-5">
      <PageHeader
        title="History"
        description="Everything changed in the admin, by you or an API token."
        actions={
          <a href={exportHref} download className={adminButtonClass({ variant: "outline" })}>
            Export CSV
          </a>
        }
      />
      <HistoryFilters people={people} />
      <HistoryView
        lines={page.lines}
        next={page.next}
        query={query}
        emptyMessage={emptyHistoryMessage(filters, whoLabel)}
        anyTimeHref={historyFiltersActive(filters) ? undefined : "/admin/audit-log?when=all"}
      />
    </div>
  );
}

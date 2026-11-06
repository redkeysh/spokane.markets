import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { adminButtonClass } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { GroupHeading } from "@/components/admin/kit/list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { InboxFilters } from "@/components/admin/inbox/inbox-filters";
import { InboxList } from "@/components/admin/inbox/inbox-list";
import { InboxViewSelect, InboxViewsNav } from "@/components/admin/inbox/inbox-views";
import { PublicStatus } from "@/components/admin/inbox/item-parts";
import { ItemView } from "@/components/admin/inbox/item-view";
import { InboxDecisions } from "@/components/admin/inbox/use-inbox-action";
import { PhotoGrid } from "@/components/admin/inbox/photo-grid";
import { SurveyTable } from "@/components/admin/inbox/survey-table";
import { itemTitle } from "@/components/admin/inbox/titles";
import { Pager } from "@/components/admin/vendors/pager";
import { loadInboxCounts, loadInboxList, loadInboxOverview, loadPublicItem, type InboxList as ListData } from "@/lib/admin/inbox/load";
import {
  INBOX_PAGE_SIZE,
  INBOX_TYPES,
  INBOX_VIEW_LABELS,
  INBOX_VIEW_SENTENCES,
  inboxBack,
  inboxHref,
  parseInboxParams,
  statusLabel,
  type InboxParams,
  type InboxType,
} from "@/lib/admin/inbox/model";
import type { InboxItem, InboxPhoto, InboxSurvey } from "@/lib/admin/inbox/types";
import { plural } from "@/lib/admin/inbox/words";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { view } = parseInboxParams(await searchParams);
  return { title: view === "all" ? "From the public" : `From the public: ${INBOX_VIEW_LABELS[view].toLowerCase()}` };
}

const NOUNS: Record<InboxType, [string, string]> = {
  submissions: ["event sent in", "events sent in"],
  reviews: ["review", "reviews"],
  photos: ["photo", "photos"],
  reports: ["report", "reports"],
  applications: ["application", "applications"],
  messages: ["message", "messages"],
  surveys: ["survey answer", "survey answers"],
};

const OVERVIEW_PER_TYPE = 5;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "12 reviews", "3 waiting reviews", "No reviews match 'bridal'". */
function resultSentence(params: InboxParams, total: number): string {
  const [single, many] = params.view === "all" ? ["item", "items"] : NOUNS[params.view];
  const status = params.status === "all" ? "" : `${statusLabel(params.view, params.status).toLowerCase()} `;
  if (total === 0) return `No ${status}${many}${params.q ? ` match "${params.q}"` : ""}.`;
  return `${total} ${status}${total === 1 ? single : many}${params.q ? ` match "${params.q}"` : ""}.`;
}

function TypeContent({ type, list, params, back, compact = false }: { type: InboxType; list: ListData; params: InboxParams; back: string; compact?: boolean }) {
  if (type === "photos") return <PhotoGrid photos={list.items as InboxPhoto[]} back={back} tickable={!compact} />;
  if (type === "surveys") return <SurveyTable surveys={list.items as InboxSurvey[]} />;
  return (
    <InboxList
      type={type}
      items={list.items as InboxItem[]}
      back={back}
      bulk={!compact}
      label={compact ? INBOX_VIEW_LABELS[type] : `${INBOX_VIEW_LABELS[type]}, ${statusLabel(type, params.status).toLowerCase()}`}
    />
  );
}

export default async function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const params = parseInboxParams(raw);
  const now = new Date();
  const fromTodo = one(raw.from) === "todo";
  const decisionKey = one(raw.d);

  if (params.item && params.view !== "all" && params.view !== "submissions" && params.view !== "surveys") {
    const rowType = { reviews: "review", photos: "photo", reports: "report", applications: "application", messages: "message" }[params.view];
    const [counts, item] = await Promise.all([loadInboxCounts(), loadPublicItem(rowType, params.item)]);
    const back = fromTodo
      ? { href: decisionKey ? `/admin?d=${encodeURIComponent(decisionKey)}` : "/admin?lane=public", label: "Back to To do" }
      : (inboxBack(one(raw.back)) ?? { href: inboxHref({ view: params.view }), label: `Back to ${INBOX_VIEW_LABELS[params.view]}` });
    return (
      <InboxDecisions>
        <Screen className="xl:grid xl:grid-cols-[232px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
          <Pane label="From the public views" tone="fog" className="hidden border-r border-seam xl:block">
            <InboxViewsNav current={params.view} counts={counts} />
          </Pane>
          <Pane label={item ? itemTitle(item) : "Item"} className="h-full">
            <div className="mx-auto w-full max-w-[1184px] space-y-6 pb-8">
              <PageHeader
                back={back}
                title={item ? itemTitle(item) : "This item is gone"}
                actions={item ? <PublicStatus kind={item.kind} status={item.status} /> : undefined}
              />
              {item ? (
                <ItemView item={item} />
              ) : (
                <Empty
                  action={{ label: `Show every ${NOUNS[params.view][0]}`, href: inboxHref({ view: params.view }) }}
                >
                  Nothing from the public has this address. It may have been deleted.
                </Empty>
              )}
            </div>
          </Pane>
        </Screen>
      </InboxDecisions>
    );
  }

  const back = inboxHref(params);
  const [counts, user] = await Promise.all([
    loadInboxCounts(),
    params.user ? db.user.findUnique({ where: { id: params.user }, select: { id: true, name: true, email: true } }) : null,
  ]);

  let body: React.ReactNode;
  let total = 0;
  if (params.view === "all") {
    const overview = await loadInboxOverview(params, OVERVIEW_PER_TYPE, now);
    const shown = INBOX_TYPES.filter((type) => overview[type].total > 0);
    total = shown.reduce((n, type) => n + overview[type].total, 0);
    body =
      shown.length === 0 ? null : (
        <div className="space-y-8">
          {shown.map((type) => {
            const list = overview[type];
            const more = list.total > list.items.length;
            return (
              <section key={type} aria-labelledby={`inbox-${type}`}>
                <GroupHeading
                  as="h2"
                  sticky={false}
                  fact={`${plural(list.total, ...NOUNS[type])}${params.status === "all" && counts[type].waiting ? `, ${counts[type].waiting} ${type === "messages" ? "unread" : "waiting"}` : ""}`}
                >
                  <span id={`inbox-${type}`}>{INBOX_VIEW_LABELS[type]}</span>
                </GroupHeading>
                <TypeContent type={type} list={list} params={params} back={back} compact />
                {more && (
                  <Link
                    href={inboxHref({ view: type, status: params.status, q: params.q })}
                    className={`${adminButtonClass({ variant: "quiet", size: "sm" })} mt-2`}
                  >
                    See all {list.total} {NOUNS[type][1]}
                  </Link>
                )}
              </section>
            );
          })}
        </div>
      );
  } else {
    const list = await loadInboxList(params.view, params, { skip: (params.page - 1) * INBOX_PAGE_SIZE, take: INBOX_PAGE_SIZE }, now);
    if (list.items.length === 0 && list.total > 0 && params.page > 1) {
      redirect(inboxHref({ ...params, page: Math.ceil(list.total / INBOX_PAGE_SIZE) }));
    }
    total = list.total;
    body =
      list.items.length === 0 ? null : (
        <div>
          <TypeContent type={params.view} list={list} params={params} back={back} />
          <Pager
            page={params.page}
            pageSize={INBOX_PAGE_SIZE}
            total={list.total}
            noun={NOUNS[params.view][1]}
            hrefFor={(page) => inboxHref({ ...params, page })}
          />
        </div>
      );
  }

  const filtered = Boolean(params.q) || params.status !== "all" || Boolean(params.user);
  const userName = user ? user.name?.trim() || user.email : null;

  return (
    <InboxDecisions>
      <Screen className="xl:grid xl:grid-cols-[232px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
        <Pane label="From the public views" tone="fog" className="hidden border-r border-seam xl:block">
          <InboxViewsNav current={params.view} counts={counts} />
        </Pane>
        <Pane label={INBOX_VIEW_LABELS[params.view]} className="h-full">
          <div className="mx-auto w-full max-w-[1184px] space-y-5 pb-8">
            <InboxViewSelect current={params.view} counts={counts} className="xl:hidden" />
            <PageHeader
              title={params.view === "all" ? "From the public" : INBOX_VIEW_LABELS[params.view]}
              description={INBOX_VIEW_SENTENCES[params.view]}
              actions={
                params.view === "applications" ? (
                  <Link href="/admin/applications/forms" className={`${adminButtonClass({ variant: "quiet" })} xl:hidden`}>
                    Application forms
                  </Link>
                ) : undefined
              }
            />
            {params.user && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-ash">
                <span>
                  Only {NOUNS[params.view as InboxType]?.[1] ?? "items"} by{" "}
                  {userName ? (
                    <Link href={`/admin/users/${params.user}`} className="rounded-sm text-lilac underline-offset-2 hover:underline">
                      {userName}
                    </Link>
                  ) : (
                    "one person"
                  )}
                  .
                </span>
                <Link
                  href={inboxHref({ ...params, user: "", page: 1 })}
                  className="inline-flex min-h-6 items-center rounded-sm font-medium text-lilac hover:underline"
                >
                  Show everyone&apos;s
                </Link>
              </p>
            )}
            <InboxFilters params={params} resultSentence={resultSentence(params, total)} />
            {body ?? (
              <Empty
                action={!filtered && params.view !== "all" ? { label: "Show everything from the public", href: "/admin/inbox" } : undefined}
                detail={filtered ? undefined : "Waiting items also show on To do under From the public."}
              >
                {filtered ? resultSentence(params, 0) : params.view === "all" ? "Nothing from the public yet." : `No ${NOUNS[params.view][1]} yet.`}
              </Empty>
            )}
          </div>
        </Pane>
      </Screen>
    </InboxDecisions>
  );
}

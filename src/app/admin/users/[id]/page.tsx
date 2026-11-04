import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ModerationStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { formatFullDate, pacificDate } from "@/lib/admin/format";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Field, Section } from "@/components/admin/kit/field";
import { UserRoleSelect } from "@/components/admin/user-role-select";
import { UserAccountStatusSelect } from "@/components/admin/user-account-status-select";
import { UserDeleteButton } from "@/components/admin/user-delete-button";
import { UserResetPasswordButton } from "@/components/admin/user-reset-password-button";
import { ROLE_WORDS } from "@/components/admin/user-words";

export const dynamic = "force-dynamic";

const REVIEW_PREVIEW_LIMIT = 5;

const REVIEW_STATUS: Record<ModerationStatus, { word: string; className: string }> = {
  PENDING: { word: "Waiting", className: "text-honey-ink" },
  APPROVED: { word: "Approved", className: "text-basalt" },
  REJECTED: { word: "Rejected", className: "text-ponderosa" },
};

const LINK = "rounded-sm text-lilac underline-offset-4 hover:underline";

async function loadUser(id: string) {
  return db.user.findUnique({
    where: { id },
    include: {
      vendorProfile: { select: { id: true, businessName: true } },
      ownedMarkets: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 20 },
      _count: {
        select: {
          reviews: true,
          ownedMarkets: { where: { deletedAt: null } },
          photos: true,
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: REVIEW_PREVIEW_LIMIT,
        include: {
          event: { select: { id: true, title: true } },
          market: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { name: true, email: true } });
  return { title: user ? user.name?.trim() || user.email : "Person not found" };
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-0.5 border-b border-seam py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
      <dt className="font-text text-sm text-ash">{term}</dt>
      <dd className="font-text text-sm text-basalt tabular-nums">{children}</dd>
    </div>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;

  const user = await loadUser(id);
  if (!user) {
    notFound();
  }

  const subscriber = user.email ? await db.subscriber.findUnique({ where: { email: user.email }, select: { id: true } }) : null;
  const isSelf = user.id === session.user.id;
  const name = user.name?.trim() || user.email;

  return (
    <div className="mx-auto w-full max-w-[1184px]">
      <div className="max-w-[784px] space-y-8">
        <PageHeader
          back={{ href: "/admin/users", label: "Back to Users" }}
          title={name}
          description={user.name?.trim() ? user.email : undefined}
          actions={<UserResetPasswordButton userId={user.id} userName={user.name} userEmail={user.email} />}
        />

        <Section id="access" title="Access">
          <Field
            id="user-role"
            label="Role"
            help={isSelf ? "This is your own account, so another admin has to change your role." : ROLE_WORDS[user.role].help}
          >
            <UserRoleSelect userId={user.id} currentRole={user.role} disabled={isSelf} />
          </Field>
          <Field
            id="user-status"
            label="Account"
            help={
              isSelf
                ? "This is your own account, so another admin has to suspend or close it."
                : "Only active accounts can use the parts of the site that need signing in."
            }
          >
            <UserAccountStatusSelect userId={user.id} currentStatus={user.accountStatus} disabled={isSelf} />
          </Field>
        </Section>

        <Section id="activity" title="Activity">
          <dl className="border-t border-seam">
            <Fact term="Joined">{formatFullDate(pacificDate(user.createdAt))}</Fact>
            <Fact term="Markets they run">
              {user.ownedMarkets.length > 0 ? (
                <span>
                  {user.ownedMarkets.map((market, i) => (
                    <span key={market.id}>
                      {i > 0 && ", "}
                      <Link href={`/admin/markets/${market.id}`} className={LINK}>
                        {market.name}
                      </Link>
                    </span>
                  ))}
                  {user._count.ownedMarkets > user.ownedMarkets.length &&
                    `, and ${user._count.ownedMarkets - user.ownedMarkets.length} more`}
                </span>
              ) : (
                "None"
              )}
            </Fact>
            <Fact term="Vendor profile">
              {user.vendorProfile ? (
                <Link href={`/admin/vendors/${user.vendorProfile.id}`} className={LINK}>
                  {user.vendorProfile.businessName}
                </Link>
              ) : (
                "None"
              )}
            </Fact>
            <Fact term="Reviews">
              {user._count.reviews > 0 ? (
                <Link href={`/admin/inbox?type=reviews&user=${user.id}`} className={LINK}>
                  {user._count.reviews === 1 ? "1 review" : `${user._count.reviews} reviews`}
                </Link>
              ) : (
                "None"
              )}
            </Fact>
            <Fact term="Photos">
              {user._count.photos > 0 ? (
                <Link href={`/admin/inbox?type=photos&user=${user.id}`} className={LINK}>
                  {user._count.photos === 1 ? "1 photo" : `${user._count.photos} photos`}
                </Link>
              ) : (
                "None"
              )}
            </Fact>
            <Fact term="Newsletter">{subscriber ? "Subscribed" : "Not subscribed"}</Fact>
          </dl>
        </Section>

        {user.reviews.length > 0 && (
          <Section id="reviews" title="Latest reviews">
            <ul role="list" className="border-t border-seam">
              {user.reviews.map((review) => {
                const status = REVIEW_STATUS[review.status];
                const target = review.event
                  ? { label: review.event.title, href: `/admin/events/${review.event.id}` }
                  : review.market
                    ? { label: review.market.name, href: `/admin/markets/${review.market.id}` }
                    : null;
                return (
                  <li key={review.id} className="border-b border-seam py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-text text-sm font-medium text-basalt">
                        {target ? (
                          <Link href={target.href} className={LINK}>
                            {target.label}
                          </Link>
                        ) : (
                          "A listing that is gone"
                        )}
                      </p>
                      <p className="font-text text-xs text-ash tabular-nums">
                        <span className={status.className}>{status.word}</span>, {review.rating} of 5 stars,{" "}
                        {formatFullDate(pacificDate(review.createdAt))}
                      </p>
                    </div>
                    {review.text && <p className="mt-1 line-clamp-2 max-w-[72ch] font-text text-sm text-ash">{review.text}</p>}
                  </li>
                );
              })}
            </ul>
            {user._count.reviews > REVIEW_PREVIEW_LIMIT && (
              <Link href={`/admin/inbox?type=reviews&user=${user.id}`} className={`inline-flex min-h-6 items-center text-sm ${LINK}`}>
                All {user._count.reviews} reviews
              </Link>
            )}
          </Section>
        )}

        {!isSelf && (
          <Section id="delete" title="Delete account">
            <p className="max-w-[72ch] font-text text-sm text-ash">
              Removes {name} and everything tied to the account. To stop someone signing in but keep their reviews and
              photos, set the account to suspended instead.
            </p>
            <div>
              <UserDeleteButton
                userId={user.id}
                userName={user.name}
                userEmail={user.email}
                isCurrentUser={isSelf}
                afterDelete="/admin/users"
              />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

import { requireAdmin } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminTable } from "@/components/admin/admin-table";
import { DeleteButton } from "@/components/admin/action-buttons";
import { deletePromotion } from "../actions";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { PromotionType } from "@prisma/client";

export const dynamic = "force-dynamic";

const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  SPONSORED: "Sponsored",
  PARTNERSHIP: "Partner Spotlight",
  FEATURED: "Featured",
};

export default async function AdminPromotionsPage() {
  await requireAdmin();

  const promotions = await db.promotion.findMany({
    include: {
      event: {
        select: { id: true, title: true, slug: true, startDate: true },
      },
      vendorProfile: {
        select: { id: true, businessName: true, slug: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { startDate: "asc" }],
  });

  const now = new Date();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Promotions"
        description="Manage featured, sponsored, and partner promotions shown across event and vendor surfaces."
        actions={
          <>
            <Button asChild>
              <Link href="/admin/promotions/new">New Promotion</Link>
            </Button>
          </>
        }
      />

      <AdminTable>
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-left font-medium">Target</th>
              <th className="p-3 text-left font-medium">Type</th>
              <th className="p-3 text-left font-medium">Sponsor</th>
              <th className="p-3 text-left font-medium">Display Period</th>
              <th className="p-3 text-left font-medium">Order</th>
              <th className="p-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {promotions.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No promotions yet. Create one to feature events or vendors.
                </td>
              </tr>
            ) : (
              promotions.map((p) => {
                const isActive =
                  p.startDate <= now &&
                  p.endDate >= now &&
                  (p.event || p.vendorProfile);
                const isEventTarget = !!p.event;
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="p-3 font-medium">
                      {p.event ? (
                        <Link
                          href={`/events/${p.event.slug}`}
                          className="text-primary hover:underline"
                        >
                          {p.event.title}
                        </Link>
                      ) : p.vendorProfile ? (
                        <Link
                          href={`/vendors/${p.vendorProfile.slug}`}
                          className="text-primary hover:underline"
                        >
                          {p.vendorProfile.businessName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {isEventTarget ? "Event" : "Vendor"}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {PROMOTION_TYPE_LABELS[p.type]}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {p.sponsorName || "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                      {isActive && (
                        <Badge variant="default" className="ml-2 text-xs">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{p.sortOrder}</td>
                    <td className="space-x-2 p-3 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/promotions/${p.id}/edit`}>Edit</Link>
                      </Button>
                      <DeleteButton
                        action={deletePromotion.bind(null, p.id)}
                        title="Delete promotion"
                        description="Are you sure? This will remove the promotion from the home page carousel."
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
      </AdminTable>
    </div>
  );
}

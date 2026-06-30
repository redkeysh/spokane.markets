import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { SITE_NAME } from "@/lib/constants";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [
    user,
    attendances,
    savedFilters,
    favoriteVendors,
    reviews,
    vendorProfile,
    notificationPreference,
  ] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          createdAt: true,
        },
      }),
      db.attendance.findMany({
        where: { userId },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              slug: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      }),
      db.savedFilter.findMany({ where: { userId } }),
      db.favoriteVendor.findMany({
        where: { userId },
        include: {
          vendorProfile: {
            select: {
              id: true,
              businessName: true,
              slug: true,
            },
          },
        },
      }),
      db.review.findMany({
        where: { userId },
        select: {
          id: true,
          rating: true,
          text: true,
          createdAt: true,
          event: { select: { title: true, slug: true } },
          market: { select: { name: true, slug: true } },
        },
      }),
      db.vendorProfile.findUnique({ where: { userId } }),
      db.notificationPreference.findUnique({ where: { userId } }),
    ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    user,
    attendances: attendances.map((a) => ({
      status: a.status,
      event: a.event,
      createdAt: a.createdAt,
    })),
    savedFilters,
    favoriteVendors: favoriteVendors.map((fv) => ({
      vendor: fv.vendorProfile,
      emailAlerts: fv.emailAlerts,
      createdAt: fv.createdAt,
    })),
    reviews,
    vendorProfile,
    notificationPreference,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${SITE_NAME.toLowerCase().replace(/\s+/g, "-")}-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

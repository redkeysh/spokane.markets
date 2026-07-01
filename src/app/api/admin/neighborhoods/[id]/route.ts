import { NextResponse } from "next/server";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { neighborhoodSchema } from "@/lib/validations";

function replaceAndDedupe(values: string[], from: string, to: string): string[] {
  return Array.from(new Set(values.map((value) => (value === from ? to : value))));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.settings.manage");
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const parsed = neighborhoodSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const updated = await db.neighborhood.update({
      where: { id },
      data: {
        label: parsed.data.label,
        slug: parsed.data.slug,
        isActive: parsed.data.isActive,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error } = await requireApiAdminPermission("admin.settings.manage");
    if (error) return error;

    const { id } = await params;
    const neighborhood = await db.neighborhood.findUnique({
      where: { id },
      select: { id: true, slug: true },
    });
    if (!neighborhood) {
      return apiError("Neighborhood not found", 404);
    }

    const { reassignToSlug } = (await request.json().catch(() => ({}))) as {
      reassignToSlug?: string;
    };

    const [venueCount, marketCount, subscriberCount, filterCount] =
      await Promise.all([
        db.venue.count({
          where: { neighborhood: neighborhood.slug, deletedAt: null },
        }),
        db.market.count({
          where: { baseArea: neighborhood.slug, deletedAt: null },
        }),
        db.subscriber.count({ where: { areas: { has: neighborhood.slug } } }),
        db.savedFilter.count({
          where: { neighborhoods: { has: neighborhood.slug } },
        }),
      ]);

    const hasReferences =
      venueCount > 0 || marketCount > 0 || subscriberCount > 0 || filterCount > 0;

    if (hasReferences && !reassignToSlug) {
      return NextResponse.json(
        {
          error: "Neighborhood is in use. Provide reassignToSlug to delete safely.",
          usage: {
            venues: venueCount,
            markets: marketCount,
            subscribers: subscriberCount,
            savedFilters: filterCount,
          },
        },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      if (hasReferences && reassignToSlug) {
        if (reassignToSlug === neighborhood.slug) {
          throw new Error("Cannot reassign to the same neighborhood slug");
        }

        const replacement = await tx.neighborhood.findUnique({
          where: { slug: reassignToSlug },
          select: { id: true },
        });
        if (!replacement) {
          throw new Error(`Replacement neighborhood does not exist: ${reassignToSlug}`);
        }

        await tx.venue.updateMany({
          where: { neighborhood: neighborhood.slug, deletedAt: null },
          data: { neighborhood: reassignToSlug },
        });
        await tx.market.updateMany({
          where: { baseArea: neighborhood.slug, deletedAt: null },
          data: { baseArea: reassignToSlug },
        });

        const subscribers = await tx.subscriber.findMany({
          where: { areas: { has: neighborhood.slug } },
          select: { id: true, areas: true },
        });
        for (const subscriber of subscribers) {
          await tx.subscriber.update({
            where: { id: subscriber.id },
            data: {
              areas: replaceAndDedupe(
                subscriber.areas,
                neighborhood.slug,
                reassignToSlug
              ),
            },
          });
        }

        const savedFilters = await tx.savedFilter.findMany({
          where: { neighborhoods: { has: neighborhood.slug } },
          select: { id: true, neighborhoods: true },
        });
        for (const savedFilter of savedFilters) {
          await tx.savedFilter.update({
            where: { id: savedFilter.id },
            data: {
              neighborhoods: replaceAndDedupe(
                savedFilter.neighborhoods,
                neighborhood.slug,
                reassignToSlug
              ),
            },
          });
        }
      }

      await tx.neighborhood.delete({ where: { id } });
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[DELETE /api/admin/neighborhoods/:id]", err);
    return apiError(
      err instanceof Error ? err.message : "Internal server error",
      err instanceof Error ? 400 : 500
    );
  }
}

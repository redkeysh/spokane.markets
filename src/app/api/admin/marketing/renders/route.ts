import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiValidationError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { marketingRenderCreateSchema } from "@/lib/validations/marketing";
import { buildEntityPrefillVariables } from "@/lib/marketing/prefill-map";
import { getRequiredPlaceholderKeys, validateRequiredPlaceholders } from "@/lib/marketing/template-utils";
import { parseAdminPagination, parseEnumParam } from "@/lib/admin/table-query";

function toUppercaseVariables(input: Record<string, string>): Record<string, string> {
  return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key.toUpperCase()] = String(value ?? "");
    return acc;
  }, {});
}

export async function GET(request: Request) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const statusFilter = parseEnumParam(searchParams.get("status") ?? undefined, [
      "QUEUED",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
    ] as const);
    const templateId = searchParams.get("templateId");
    const q = searchParams.get("q")?.trim();
    const { limit } = parseAdminPagination({
      limit: searchParams.get("limit") ?? undefined,
    });

    const renders = await db.marketingRender.findMany({
      where: {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(templateId ? { templateId } : {}),
        ...(q
          ? {
              OR: [
                { template: { name: { contains: q, mode: "insensitive" } } },
                { template: { slug: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        template: { select: { id: true, slug: true, name: true, profile: true } },
        user: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, businessName: true, slug: true } },
        event: { select: { id: true, title: true, slug: true } },
        market: { select: { id: true, name: true, slug: true } },
        folders: { include: { folder: true } },
        tags: { include: { tag: true } },
      },
    });
    return NextResponse.json({ renders });
  } catch (err) {
    console.error("[GET /api/admin/marketing/renders]", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await requireApiAdmin();
    if (error) return error;
    const body = await request.json();
    const parsed = marketingRenderCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const template = await db.marketingTemplate.findUnique({
      where: { id: data.templateId },
      select: {
        id: true,
        version: true,
        active: true,
        placeholderSchemaJson: true,
        safeHtmlPlaceholders: true,
      },
    });
    if (!template || !template.active) {
      return apiError("Template not found or inactive", 404);
    }

    const prefill = await buildEntityPrefillVariables({
      vendorId: data.entityRefs?.vendorId ?? null,
      eventId: data.entityRefs?.eventId ?? null,
      marketId: data.entityRefs?.marketId ?? null,
    });
    const userVariables = toUppercaseVariables(data.variables);
    const mergedVariables = { ...prefill, ...userVariables };

    const schema = (template.placeholderSchemaJson && typeof template.placeholderSchemaJson === "object"
      ? (template.placeholderSchemaJson as { placeholders?: Array<{ key: string; required?: boolean }> })
      : null);
    const requiredKeys = getRequiredPlaceholderKeys(
      schema ? { placeholders: schema.placeholders ?? [] } : null
    );
    const missing = validateRequiredPlaceholders(requiredKeys, mergedVariables);
    if (missing.length) {
      return apiError("Missing required placeholders", 400, {
        code: "MISSING_PLACEHOLDERS",
        details: { missing },
      });
    }

    const rawAllowed = new Set((template.safeHtmlPlaceholders ?? []).map((k) => k.toUpperCase()));
    for (const key of Object.keys(mergedVariables)) {
      if (key.endsWith("_HTML") && !rawAllowed.has(key)) {
        return apiError(`HTML placeholder ${key} is not allowed for this template`, 400);
      }
    }

    const created = await db.marketingRender.create({
      data: {
        userId: session!.user.id,
        templateId: template.id,
        templateVersion: template.version,
        vendorId: data.entityRefs?.vendorId ?? null,
        eventId: data.entityRefs?.eventId ?? null,
        marketId: data.entityRefs?.marketId ?? null,
        variablesJson: mergedVariables as unknown as Prisma.InputJsonValue,
        scale: data.scale,
        folders: data.folderIds?.length
          ? {
              createMany: {
                data: data.folderIds.map((folderId) => ({ folderId })),
                skipDuplicates: true,
              },
            }
          : undefined,
        tags: data.tagIds?.length
          ? {
              createMany: {
                data: data.tagIds.map((tagId) => ({ tagId })),
                skipDuplicates: true,
              },
            }
          : undefined,
      },
      include: {
        template: { select: { name: true, slug: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: session?.user.id,
        action: "MARKETING_RENDER_CREATE",
        targetType: "MARKETING_RENDER",
        targetId: created.id,
        metadata: {
          templateId: created.templateId,
          scale: created.scale,
        },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        status: created.status,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/admin/marketing/renders]", err);
    return apiError("Internal server error", 500);
  }
}

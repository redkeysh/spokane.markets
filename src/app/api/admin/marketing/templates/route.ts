import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { marketingTemplateCreateSchema } from "@/lib/validations/marketing";
import { buildPlaceholderSchemaFromTokens, detectTokensFromBundle } from "@/lib/marketing/template-utils";

export async function GET() {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;
    const templates = await db.marketingTemplate.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        campaign: { select: { id: true, slug: true, name: true, year: true } },
        assets: { select: { id: true, kind: true, name: true, storageKey: true, updatedAt: true } },
        _count: { select: { renders: true } },
      },
    });
    return NextResponse.json({ templates });
  } catch (err) {
    console.error("[GET /api/admin/marketing/templates]", err);
    return apiError("Internal server error", 500);
  }
}

export async function POST(request: Request) {
  try {
    const { session, error } = await requireApiAdmin();
    if (error) return error;
    const body = await request.json();
    const parsed = marketingTemplateCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;
    const tokenSources = data.assets
      .filter((asset) => asset.kind === "HTML" || asset.kind === "TEXT")
      .map((asset) => asset.inlineContent ?? "");
    const detectedTokens = detectTokensFromBundle(tokenSources);
    const mergedSchema = buildPlaceholderSchemaFromTokens(detectedTokens, {
      placeholders: data.placeholderSchemaJson,
    });

    const created = await db.marketingTemplate.create({
      data: {
        slug: data.slug,
        name: data.name,
        category: data.category,
        profile: data.profile,
        placeholderSchemaJson: mergedSchema as unknown as Prisma.InputJsonValue,
        safeHtmlPlaceholders: data.safeHtmlPlaceholders,
        companionTextKeys: data.companionTextKeys,
        friendlyFilenameStem: data.friendlyFilenameStem || null,
        defaultScale: data.defaultScale,
        campaignId: data.campaignId || null,
        active: data.active,
        assets: {
          create: data.assets.map((asset) => ({
            kind: asset.kind,
            name: asset.name,
            storageKey: asset.storageKey || null,
            inlineContent: asset.inlineContent ?? null,
            mimeType: asset.mimeType ?? null,
          })),
        },
      },
      include: {
        assets: true,
      },
    });

    await db.auditLog.create({
      data: {
        userId: session?.user.id,
        action: "MARKETING_TEMPLATE_CREATE",
        targetType: "MARKETING_TEMPLATE",
        targetId: created.id,
        metadata: { slug: created.slug },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

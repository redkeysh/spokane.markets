import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { apiError, apiNotFound, apiValidationError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { marketingTemplateUpdateSchema } from "@/lib/validations/marketing";
import { buildPlaceholderSchemaFromTokens, detectTokensFromBundle } from "@/lib/marketing/template-utils";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;
    const { id } = await params;
    const template = await db.marketingTemplate.findUnique({
      where: { id },
      include: {
        campaign: true,
        assets: {
          orderBy: [{ kind: "asc" }, { name: "asc" }],
        },
      },
    });
    if (!template) return apiNotFound("Template");
    return NextResponse.json(template);
  } catch (err) {
    console.error("[GET /api/admin/marketing/templates/:id]", err);
    return apiError("Internal server error", 500);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { session, error } = await requireApiAdmin();
    if (error) return error;
    const { id } = await params;
    const body = await request.json();
    const parsed = marketingTemplateUpdateSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;

    const exists = await db.marketingTemplate.findUnique({ where: { id } });
    if (!exists) return apiNotFound("Template");

    const tokenSources = data.assets
      .filter((asset) => asset.kind === "HTML" || asset.kind === "TEXT")
      .map((asset) => asset.inlineContent ?? "");
    const detectedTokens = detectTokensFromBundle(tokenSources);
    const mergedSchema = buildPlaceholderSchemaFromTokens(detectedTokens, {
      placeholders: data.placeholderSchemaJson,
    });

    const updated = await db.$transaction(async (tx) => {
      const template = await tx.marketingTemplate.update({
        where: { id },
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
          version: data.versionBump ? { increment: 1 } : undefined,
        },
      });
      // Replace assets atomically so a mid-way failure can't leave the template
      // with no assets.
      await tx.marketingTemplateAsset.deleteMany({ where: { templateId: id } });
      await tx.marketingTemplateAsset.createMany({
        data: data.assets.map((asset) => ({
          templateId: id,
          kind: asset.kind,
          name: asset.name,
          storageKey: asset.storageKey || null,
          inlineContent: asset.inlineContent ?? null,
          mimeType: asset.mimeType ?? null,
        })),
      });
      return template;
    });

    await db.auditLog.create({
      data: {
        userId: session?.user.id,
        action: "MARKETING_TEMPLATE_UPDATE",
        targetType: "MARKETING_TEMPLATE",
        targetId: updated.id,
        metadata: { slug: updated.slug },
      },
    });

    const result = await db.marketingTemplate.findUnique({
      where: { id },
      include: { assets: { orderBy: [{ kind: "asc" }, { name: "asc" }] } },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[PUT /api/admin/marketing/templates/:id]", err);
    return apiError("Internal server error", 500);
  }
}

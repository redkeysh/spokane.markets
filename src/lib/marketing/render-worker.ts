import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { MarketingRenderStatus, MarketingTemplateAssetKind, type MarketingTemplateProfile } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPngFilename, buildTxtFilename, getDefaultFilenameStem } from "@/lib/marketing/output-naming";
import { readMarketingTextByKey, writeMarketingPng, writeMarketingText } from "@/lib/marketing/storage";
import { detectTemplateTokens, renderTemplateString } from "@/lib/marketing/template-utils";
import { isAllowedRemoteUrl } from "@/lib/marketing/network-safety";

type PngOutputRecord = {
  name: string;
  url: string;
  width: number;
  height: number;
};

type TextOutputRecord = {
  name: string;
  url: string;
};

type ResolvedTemplateAssets = {
  htmlSource: string;
  companionTexts: Array<{ name: string; source: string }>;
};

function requireChromiumExecutablePath(): string {
  const value = process.env.CHROMIUM_EXECUTABLE_PATH?.trim();
  if (!value) {
    throw new Error("CHROMIUM_EXECUTABLE_PATH is required for marketing render worker");
  }
  return value;
}

async function readAssetContent(storageKey: string | null, inlineContent: string | null): Promise<string> {
  if (inlineContent?.length) return inlineContent;
  if (!storageKey) return "";
  return readMarketingTextByKey(storageKey);
}

async function resolveTemplateAssets(templateId: string): Promise<ResolvedTemplateAssets> {
  const assets = await db.marketingTemplateAsset.findMany({
    where: { templateId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const htmlAsset = assets.find((asset) => asset.kind === MarketingTemplateAssetKind.HTML);
  if (!htmlAsset) {
    throw new Error("Template is missing an HTML asset");
  }
  const htmlSource = await readAssetContent(htmlAsset.storageKey, htmlAsset.inlineContent);
  if (!htmlSource.trim()) {
    throw new Error("Template HTML source is empty");
  }
  const companionTextAssets = assets.filter((asset) => asset.kind === MarketingTemplateAssetKind.TEXT);
  const companionTexts: Array<{ name: string; source: string }> = [];
  for (const asset of companionTextAssets) {
    const source = await readAssetContent(asset.storageKey, asset.inlineContent);
    companionTexts.push({ name: asset.name, source });
  }
  return { htmlSource, companionTexts };
}

function getViewportForProfile(profile: MarketingTemplateProfile, scale: number): {
  width: number;
  height: number;
  deviceScaleFactor: number;
  downsampleTo?: { width: number; height: number };
} {
  if (profile === "IG_STORY") {
    return {
      width: 2160 * scale,
      height: 3840 * scale,
      deviceScaleFactor: 1,
      downsampleTo: { width: 1080, height: 1920 },
    };
  }
  return {
    width: 1080,
    height: 1080,
    deviceScaleFactor: scale,
  };
}

async function renderPngFromHtml(opts: {
  html: string;
  profile: MarketingTemplateProfile;
  scale: number;
}): Promise<{ png: Buffer; width: number; height: number }> {
  const executablePath = requireChromiumExecutablePath();
  const viewport = getViewportForProfile(opts.profile, opts.scale);
  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("file://") || url.startsWith("data:")) {
        req.continue();
        return;
      }
      if (isAllowedRemoteUrl(url)) {
        req.continue();
        return;
      }
      req.abort("blockedbyclient");
    });
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
    });
    const htmlPath = join(tmpdir(), `marketing-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
    await writeFile(htmlPath, opts.html, "utf8");
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const screenshot = (await page.screenshot({
      fullPage: true,
      type: "png",
    })) as Buffer;
    if (viewport.downsampleTo) {
      const downsampled = await sharp(screenshot)
        .resize(viewport.downsampleTo.width, viewport.downsampleTo.height, {
          fit: "cover",
          kernel: sharp.kernel.lanczos3,
        })
        .png()
        .toBuffer();
      return {
        png: downsampled,
        width: viewport.downsampleTo.width,
        height: viewport.downsampleTo.height,
      };
    }
    return {
      png: screenshot,
      width: 1080 * opts.scale,
      height: 1080 * opts.scale,
    };
  } finally {
    await browser?.close();
  }
}

export async function processMarketingRenderById(renderId: string): Promise<void> {
  const render = await db.marketingRender.findUnique({
    where: { id: renderId },
    include: {
      template: true,
    },
  });
  if (!render) {
    throw new Error("Render job not found");
  }
  // Don't resurrect a soft-deleted job.
  if (render.deletedAt) {
    return;
  }
  // Atomically claim the job: only a QUEUED row transitions to PROCESSING, so
  // two concurrent invocations cannot both render the same job. A row already
  // PROCESSING is treated as claimed and left alone.
  const claim = await db.marketingRender.updateMany({
    where: {
      id: renderId,
      status: MarketingRenderStatus.QUEUED,
      deletedAt: null,
    },
    data: {
      status: MarketingRenderStatus.PROCESSING,
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  if (claim.count === 0) {
    return;
  }

  try {
    const variables = render.variablesJson as Record<string, string>;
    const safeHtml = (render.template.safeHtmlPlaceholders ?? []).map((key) => key.toUpperCase());
    const assets = await resolveTemplateAssets(render.templateId);

    const htmlTokens = detectTemplateTokens(assets.htmlSource);
    const htmlVariables: Record<string, string> = {};
    for (const token of htmlTokens) {
      htmlVariables[token] = variables[token] ?? "";
    }
    const renderedHtml = renderTemplateString(assets.htmlSource, htmlVariables, {
      rawHtmlPlaceholders: safeHtml,
    });

    const pngResult = await renderPngFromHtml({
      html: renderedHtml,
      profile: render.template.profile,
      scale: render.scale,
    });

    const stem = render.template.friendlyFilenameStem || getDefaultFilenameStem(render.template.slug);
    const pngFileName = buildPngFilename({
      stem,
      profile: render.template.profile,
      scale: render.scale,
      includeScaleSuffix: true,
    });
    const pngSaved = await writeMarketingPng(pngResult.png, pngFileName);
    const pngOutputs: PngOutputRecord[] = [
      {
        name: pngFileName,
        url: pngSaved.publicUrl,
        width: pngResult.width,
        height: pngResult.height,
      },
    ];

    const textOutputs: TextOutputRecord[] = [];
    for (const textAsset of assets.companionTexts) {
      const textTokens = detectTemplateTokens(textAsset.source);
      const textVariables: Record<string, string> = {};
      for (const token of textTokens) {
        textVariables[token] = variables[token] ?? "";
      }
      const renderedText = renderTemplateString(textAsset.source, textVariables, {
        rawHtmlPlaceholders: safeHtml,
      });
      const textFileName = buildTxtFilename({
        stem,
        key: textAsset.name.replace(/\.[^.]+$/, ""),
      });
      const textSaved = await writeMarketingText(renderedText, textFileName);
      textOutputs.push({
        name: textFileName,
        url: textSaved.publicUrl,
      });
    }

    await db.marketingRender.update({
      where: { id: renderId },
      data: {
        status: MarketingRenderStatus.SUCCEEDED,
        finishedAt: new Date(),
        pngOutputsJson: pngOutputs,
        textOutputsJson: textOutputs,
      },
    });
  } catch (error) {
    await db.marketingRender.update({
      where: { id: renderId },
      data: {
        status: MarketingRenderStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown render failure",
      },
    });
    throw error;
  }
}

export async function processNextQueuedMarketingRender(): Promise<string | null> {
  const nextJob = await db.marketingRender.findFirst({
    where: {
      status: MarketingRenderStatus.QUEUED,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!nextJob) return null;
  await processMarketingRenderById(nextJob.id);
  return nextJob.id;
}

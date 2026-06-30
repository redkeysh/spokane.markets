import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import crypto from "node:crypto";

const UPLOAD_DIR = join(process.cwd(), "uploads", "photos");

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ok, retryAfter } = await checkRateLimit(session.user.id, "uploads");
  if (!ok) {
    const headers = retryAfter ? { "Retry-After": String(retryAfter) } : undefined;
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" },
      { status: 400 }
    );
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB" },
      { status: 400 }
    );
  }

  const reviewId = formData.get("reviewId") as string | null;
  const eventId = formData.get("eventId") as string | null;
  const marketId = formData.get("marketId") as string | null;

  // Validate attachment targets before writing the file: a non-existent id must
  // return a clean 4xx instead of an unhandled foreign-key 500, and a user may
  // only attach photos to their own review.
  if (reviewId) {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      select: { userId: true },
    });
    if (!review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (eventId) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
  }
  if (marketId) {
    const market = await db.market.findUnique({
      where: { id: marketId },
      select: { id: true },
    });
    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
  }

  const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  const ext = MIME_TO_EXT[file.type] ?? "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;

  await mkdir(UPLOAD_DIR, { recursive: true });

  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeFile(join(UPLOAD_DIR, filename), bytes);

  let photo;
  try {
    photo = await db.photo.create({
      data: {
        url: `/uploads/photos/${filename}`,
        alt: file.name,
        status: "PENDING",
        uploadedById: session.user.id!,
        reviewId: reviewId || null,
        eventId: eventId || null,
        marketId: marketId || null,
      },
    });
  } catch (err) {
    console.error("Photo create error:", err);
    return NextResponse.json({ error: "Failed to save photo" }, { status: 500 });
  }

  return NextResponse.json(photo, { status: 201 });
}

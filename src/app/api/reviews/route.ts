import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { reviewSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ok, retryAfter } = await checkRateLimit(session.user.id, "reviews");
  if (!ok) {
    const headers = retryAfter ? { "Retry-After": String(retryAfter) } : undefined;
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers }
    );
  }

  const body = await request.json();
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { eventId, marketId, ...rest } = parsed.data;

  if (!eventId && !marketId) {
    return NextResponse.json(
      { error: "Either eventId or marketId is required" },
      { status: 400 }
    );
  }

  if (eventId && marketId) {
    return NextResponse.json(
      { error: "Provide either eventId or marketId, not both" },
      { status: 400 }
    );
  }

  // Validate the target exists so a bad id returns 404 instead of an unhandled
  // foreign-key 500.
  const targetFound = eventId
    ? (await db.event.findUnique({ where: { id: eventId }, select: { id: true } })) != null
    : (await db.market.findUnique({ where: { id: marketId! }, select: { id: true } })) != null;
  if (!targetFound) {
    return NextResponse.json({ error: "Target not found" }, { status: 404 });
  }

  const existing = await db.review.findFirst({
    where: {
      userId: session.user.id!,
      ...(eventId ? { eventId } : { marketId: marketId! }),
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You have already reviewed this event or market." },
      { status: 409 }
    );
  }

  const review = await db.review.create({
    data: {
      userId: session.user.id!,
      eventId: eventId ?? null,
      marketId: marketId ?? null,
      status: "PENDING",
      ...rest,
    },
  });

  const recipientIds = new Set<string>();
  let link: string | null = null;

  if (eventId) {
    const event = await db.event.findUnique({
      where: { id: eventId },
      select: {
        submittedById: true,
        slug: true,
        market: {
          select: {
            ownerId: true,
            memberships: {
              where: { role: { in: ["OWNER", "MANAGER"] } },
              select: { userId: true },
            },
          },
        },
      },
    });
    if (event?.submittedById) recipientIds.add(event.submittedById);
    if (event?.market?.ownerId) recipientIds.add(event.market.ownerId);
    for (const membership of event?.market?.memberships ?? []) {
      recipientIds.add(membership.userId);
    }
    link = event ? `/events/${event.slug}` : null;
  } else if (marketId) {
    const market = await db.market.findUnique({
      where: { id: marketId },
      select: {
        ownerId: true,
        slug: true,
        memberships: {
          where: { role: { in: ["OWNER", "MANAGER"] } },
          select: { userId: true },
        },
      },
    });
    if (market?.ownerId) recipientIds.add(market.ownerId);
    for (const membership of market?.memberships ?? []) {
      recipientIds.add(membership.userId);
    }
    link = market ? `/markets/${market.slug}` : null;
  }

  const targetName = eventId ? "event" : "market";
  for (const recipientId of recipientIds) {
    if (recipientId === session.user.id) continue;
    const prefs = await db.notificationPreference.findUnique({
      where: { userId: recipientId },
    });
    const allowReviewAlerts =
      prefs?.reviewAlertsEnabled ?? prefs?.organizerAlertsEnabled ?? true;
    if (!allowReviewAlerts) continue;

    await createNotification({
      userId: recipientId,
      type: "NEW_REVIEW",
      title: "New review",
      body: `Someone left a review on your ${targetName}.`,
      link: link ?? undefined,
      objectType: "review",
      objectId: eventId ?? marketId!,
    });
  }

  return NextResponse.json(review, { status: 201 });
}

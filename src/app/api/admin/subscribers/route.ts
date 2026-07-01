import { db } from "@/lib/db";
import { assertNeighborhoodSlugList } from "@/lib/neighborhoods";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-response";

const createSchema = z.object({
  email: z.string().email("Valid email is required"),
  areas: z.array(z.string()).optional().default([]),
});

export async function POST(request: Request) {
  const { error } = await requireApiAdminPermission("admin.settings.manage");
  if (error) return error;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email } = parsed.data;
  let areas: string[];
  try {
    areas = await assertNeighborhoodSlugList(parsed.data.areas, "areas");
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Invalid areas values",
      },
      { status: 400 }
    );
  }
  const normalizedEmail = email.toLowerCase();

  const existing = await db.subscriber.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return NextResponse.json(
      { error: { email: ["This email is already subscribed"] } },
      { status: 409 }
    );
  }

  let subscriber;
  try {
    subscriber = await db.subscriber.create({
      data: { email: normalizedEmail, areas },
    });
  } catch (err) {
    return handleApiError(err);
  }
  return NextResponse.json(subscriber, { status: 201 });
}

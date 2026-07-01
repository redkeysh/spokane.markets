import { requireApiAdmin } from "@/lib/api-auth";
import { apiValidationError, handleApiError } from "@/lib/api-response";
import { db } from "@/lib/db";
import { tagSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const tags = await db.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { events: true } } },
    });
    return NextResponse.json(tags);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { error } = await requireApiAdmin();
    if (error) return error;

    const body = await request.json();
    const parsed = tagSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors);
    }

    const tag = await db.tag.create({
      data: { name: parsed.data.name, slug: parsed.data.slug },
    });
    return NextResponse.json(tag, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const submitSchema = z.object({
  formType: z.enum(["VENDOR", "MARKET", "VENDOR_VERIFICATION"]),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export async function POST(request: Request) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const { ok } = await checkRateLimit(ip, "application");
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { formType, name, email, answers } = parsed.data;

    const form = await db.applicationForm.findUnique({
      where: { type: formType },
    });
    if (!form || !form.active) {
      return NextResponse.json(
        { error: "This application is not currently accepting submissions." },
        { status: 404 }
      );
    }

    // Validate required fields
    const fields = form.fields as Array<{ id: string; label: string; required?: boolean }>;
    const isBlankAnswer = (value: string | string[] | undefined): boolean => {
      if (value == null) return true;
      if (Array.isArray(value)) return value.every((v) => !v.trim());
      return !value.trim();
    };
    const missing = fields
      .filter((f) => f.required && isBlankAnswer(answers[f.id]))
      .map((f) => f.label);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Check for duplicate pending applications
    const existing = await db.application.findFirst({
      where: { formId: form.id, email, status: "PENDING" },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have a pending application. We'll review it soon!" },
        { status: 409 }
      );
    }

    const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);

    await db.application.create({
      data: {
        formId: form.id,
        userId: session?.user?.id ?? null,
        name,
        email,
        answers: answers as Record<string, string | string[]>,
        status: "PENDING",
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Application submission error:", err);
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }
}

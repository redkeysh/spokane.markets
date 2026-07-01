import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { adminCreateUserSchema } from "@/lib/validations";
import { requireApiAdminPermission } from "@/lib/api-auth";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  const { error } = await requireApiAdminPermission("admin.users.manage");
  if (error) return error;

  const body = await request.json();
  const parsed = adminCreateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, password, role } = parsed.data;

  // Minting an ADMIN requires the role-management permission (users.manage alone
  // must not be able to create an admin), matching the PATCH role-change gate.
  if (role === "ADMIN") {
    const { error: roleError } = await requireApiAdminPermission("admin.roles.manage");
    if (roleError) return roleError;
  }

  const existing = await db.user.findUnique({
    where: { email },
  });
  if (existing) {
    return NextResponse.json(
      { error: { email: ["An account with this email already exists"] } },
      { status: 409 }
    );
  }

  try {
    const signUpResult = await auth.api.signUpEmail({
      body: { name, email, password },
    });

    if (!signUpResult?.user) {
      return NextResponse.json(
        { error: "Failed to create user" },
        { status: 500 }
      );
    }

    const user = await db.user.update({
      where: { id: signUpResult.user.id },
      data: { role, emailVerified: true },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        accountStatus: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (err) {
    // Prisma races (e.g. duplicate email) -> mapped status; anything else
    // (e.g. better-auth password policy) -> a clean 400 the form can show,
    // instead of an unhandled non-JSON 500.
    if (err && typeof err === "object" && "code" in err) {
      return handleApiError(err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user" },
      { status: 400 }
    );
  }
}

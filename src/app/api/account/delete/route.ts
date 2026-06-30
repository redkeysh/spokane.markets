import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
  password: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Type DELETE to confirm account deletion" },
      { status: 400 }
    );
  }

  const credentialAccount = await db.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { password: true },
  });

  if (credentialAccount?.password) {
    if (!parsed.data.password) {
      return NextResponse.json(
        { error: "Password is required to delete your account" },
        { status: 400 }
      );
    }

    // Verify password by attempting a sign-in check via Better Auth
    try {
      await auth.api.signInEmail({
        body: {
          email: session.user.email,
          password: parsed.data.password,
        },
      });
    } catch {
      return NextResponse.json(
        { error: "Password is incorrect" },
        { status: 400 }
      );
    }
  }

  // Soft-delete the user's vendor profile in the same transaction. Deleting the
  // user only nulls VendorProfile.userId (onDelete: SetNull), which would leave
  // the listing orphaned but still publicly visible (the public query filters
  // on deletedAt, not userId).
  await db.$transaction(async (tx) => {
    await tx.vendorProfile.updateMany({
      where: { userId: session.user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await tx.user.delete({
      where: { id: session.user.id },
    });
  });

  return NextResponse.json({ success: true });
}

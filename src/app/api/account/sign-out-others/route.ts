import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Exclude the current session by its raw DB token. The session cookie value
  // is signed ("<token>.<signature>"), so comparing it against the unsigned
  // Session.token column never matches the current row and would delete every
  // session, including this one. Use the token from the resolved session.
  const currentToken = session.session?.token;

  await db.session.deleteMany({
    where: {
      userId: session.user.id,
      ...(currentToken ? { token: { not: currentToken } } : {}),
    },
  });

  return NextResponse.json({ success: true });
}

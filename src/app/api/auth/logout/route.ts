import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/lib/auth";
import { getClientIp, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await getSession();
  const ip = getClientIp(request);
  await clearSession();
  if (session) {
    logEvent({
      event: "auth.logout",
      message: "User logged out.",
      userId: session.userId,
      ip,
    });
  }
  return NextResponse.json({ ok: true });
}

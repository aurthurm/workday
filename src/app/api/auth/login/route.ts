import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, listMembershipsForUser } from "@/lib/data";
import { setSession, setWorkspaceCookie } from "@/lib/auth";
import { parseJson, emailSchema, passwordSchema } from "@/lib/validation";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limiter = rateLimit(`login:${ip ?? "unknown"}`, {
    windowMs: 10 * 60 * 1000,
    max: 10,
  });
  if (!limiter.allowed) {
    logEvent({
      level: "warn",
      event: "auth.login.rate_limited",
      message: "Login rate limit exceeded.",
      ip,
    });
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = await parseJson(
    request,
    z.object({ email: emailSchema, password: passwordSchema })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const password = parsed.data.password;

  const user = getUserByEmail(email);
  if (!user) {
    logEvent({
      level: "warn",
      event: "auth.login.failed",
      message: "Invalid email or password.",
      ip,
      meta: { email },
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    logEvent({
      level: "warn",
      event: "auth.login.failed",
      message: "Invalid email or password.",
      ip,
      meta: { email },
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  await setSession({ userId: user.id, email: user.email, name: user.name });

  const memberships = listMembershipsForUser(user.id);
  if (memberships.length > 0) {
    await setWorkspaceCookie(memberships[0].workspace_id);
  }

  logEvent({
    event: "auth.login.success",
    message: "User logged in.",
    userId: user.id,
    ip,
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}

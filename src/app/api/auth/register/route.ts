import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import {
  createMembership,
  createUser,
  createWorkspace,
  getUserByEmail,
} from "@/lib/data";
import { db } from "@/lib/db";
import { setSession, setWorkspaceCookie } from "@/lib/auth";
import { parseJson, emailSchema, nameSchema, passwordSchema } from "@/lib/validation";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limiter = rateLimit(`register:${ip ?? "unknown"}`, {
    windowMs: 10 * 60 * 1000,
    max: 5,
  });
  if (!limiter.allowed) {
    logEvent({
      level: "warn",
      event: "auth.register.rate_limited",
      message: "Registration rate limit exceeded.",
      ip,
    });
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const parsed = await parseJson(
    request,
    z.object({
      email: emailSchema,
      password: passwordSchema,
      name: nameSchema,
      workspaceName: z.string().trim().max(80).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const name = parsed.data.name;
  const password = parsed.data.password;

  const existing = getUserByEmail(email);
  if (existing) {
    logEvent({
      level: "warn",
      event: "auth.register.duplicate",
      message: "Attempt to register existing email.",
      ip,
      meta: { email },
    });
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = createUser({ email, name, passwordHash });

  const workspaceId = createWorkspace({
    name: parsed.data.workspaceName || `${name}'s Workspace`,
    type: "personal",
  });
  createMembership({ userId, workspaceId, role: "admin" });
  const defaultCategories = [
    { name: "Admin", color: "#2563eb" },
    { name: "Technical", color: "#0f766e" },
    { name: "Field", color: "#16a34a" },
    { name: "Other", color: "#64748b" },
  ];
  defaultCategories.forEach((category) => {
    db.prepare(
      "INSERT INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      workspaceId,
      category.name,
      category.color,
      new Date().toISOString()
    );
  });

  await setSession({ userId, email, name });
  await setWorkspaceCookie(workspaceId);

  logEvent({
    event: "auth.register.success",
    message: "User registered.",
    userId,
    ip,
  });

  return NextResponse.json({
    user: { id: userId, email, name },
    workspaceId,
  });
}

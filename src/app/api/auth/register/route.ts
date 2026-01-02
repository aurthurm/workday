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

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    name?: string;
    workspaceName?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim();
  const password = body.password?.trim();

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = createUser({ email, name, passwordHash });

  const workspaceId = createWorkspace({
    name: body.workspaceName?.trim() || `${name}'s Workspace`,
    type: "personal",
  });
  createMembership({ userId, workspaceId, role: "admin" });
  ["Admin", "Technical", "Field", "Other"].forEach((category) => {
    db.prepare(
      "INSERT INTO categories (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), workspaceId, category, new Date().toISOString());
  });

  await setSession({ userId, email, name });
  await setWorkspaceCookie(workspaceId);

  return NextResponse.json({
    user: { id: userId, email, name },
    workspaceId,
  });
}

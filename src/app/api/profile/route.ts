import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, setSession } from "@/lib/auth";
import { getUserById, getUserByEmail, listMembershipsForUser } from "@/lib/data";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const memberships = listMembershipsForUser(session.userId);
  return NextResponse.json({
    user,
    memberships: memberships.map((membership) => ({
      workspaceId: membership.workspace_id,
      workspaceName: membership.name,
      workspaceType: membership.type,
      role: membership.role,
    })),
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = db
    .prepare(
      "SELECT id, email, name, password_hash as passwordHash FROM users WHERE id = ?"
    )
    .get(session.userId) as
    | { id: string; email: string; name: string; passwordHash: string }
    | undefined;

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const nextName = body.name?.trim();
  const nextEmail = body.email?.trim().toLowerCase();

  if (nextEmail && nextEmail !== user.email) {
    const existing = getUserByEmail(nextEmail);
    if (existing && existing.id !== user.id) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }
  }

  if (nextName || nextEmail) {
    db.prepare("UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE id = ?").run(
      nextName ?? null,
      nextEmail ?? null,
      user.id
    );
  }

  if (body.newPassword) {
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required." },
        { status: 400 }
      );
    }
    const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }
    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      passwordHash,
      user.id
    );
  }

  const updatedUser = getUserById(user.id);
  if (updatedUser) {
    await setSession({
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
    });
  }

  return NextResponse.json({ ok: true });
}

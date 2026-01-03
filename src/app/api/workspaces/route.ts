import { NextResponse } from "next/server";
import {
  createMembership,
  createWorkspace,
  getActiveWorkspace,
  listMembershipsForUser,
} from "@/lib/data";
import { getSession, getWorkspaceCookie, setWorkspaceCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const memberships = listMembershipsForUser(session.userId);
  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());

  return NextResponse.json({
    workspaces: memberships.map((membership) => ({
      id: membership.workspace_id,
      name: membership.name,
      type: membership.type,
      role: membership.role,
    })),
    activeWorkspaceId: active?.workspace?.id ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    type?: "personal" | "organization";
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Workspace name is required." },
      { status: 400 }
    );
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active || active.membership.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins can create workspaces." },
      { status: 403 }
    );
  }

  const workspaceId = createWorkspace({
    name,
    type: body.type ?? "organization",
  });
  createMembership({ userId: session.userId, workspaceId, role: "admin" });
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
  await setWorkspaceCookie(workspaceId);

  return NextResponse.json({ id: workspaceId, name, type: body.type ?? "organization" });
}

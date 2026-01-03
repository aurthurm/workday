import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { createWorkspace, getOrgMembership } from "@/lib/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const membership = getOrgMembership(session.userId, id);
  if (!membership || membership.status !== "active") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const workspaces = db
    .prepare(
      "SELECT id, name, type, org_id, is_default, created_at FROM workspaces WHERE org_id = ? ORDER BY created_at"
    )
    .all(id) as Array<{
    id: string;
    name: string;
    type: string;
    org_id: string;
    is_default: number;
    created_at: string;
  }>;

  return NextResponse.json({ workspaces });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const membership = getOrgMembership(session.userId, id);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Workspace name is required." },
      { status: 400 }
    );
  }

  const workspaceId = createWorkspace({
    name,
    type: "organization",
    orgId: id,
    isDefault: 0,
  });

  db.prepare(
    "INSERT INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(randomUUID(), session.userId, workspaceId, "admin", new Date().toISOString());

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

  return NextResponse.json({ id: workspaceId, name });
}

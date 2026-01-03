import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getDefaultOrgWorkspace, getOrgMembership } from "@/lib/data";
import { randomUUID } from "crypto";

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

  const members = db
    .prepare(
      "SELECT org_members.id, org_members.user_id, org_members.role, org_members.status, users.name, users.email FROM org_members JOIN users ON users.id = org_members.user_id WHERE org_members.org_id = ? ORDER BY users.name"
    )
    .all(id) as Array<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    name: string;
    email: string;
  }>;

  return NextResponse.json({ members });
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

  const body = (await request.json()) as {
    userId?: string;
    role?: "owner" | "admin" | "supervisor" | "member";
  };
  if (!body.userId) {
    return NextResponse.json({ error: "User id is required." }, { status: 400 });
  }
  const role = body.role ?? "member";

  db.prepare(
    "INSERT OR IGNORE INTO org_members (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)"
  ).run(randomUUID(), id, body.userId, role, new Date().toISOString());

  const defaultWorkspace = getDefaultOrgWorkspace(id);
  if (defaultWorkspace) {
    db.prepare(
      "INSERT OR IGNORE INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      body.userId,
      defaultWorkspace.id,
      role === "owner" || role === "admin" ? "admin" : "member",
      new Date().toISOString()
    );
  }

  return NextResponse.json({ ok: true });
}

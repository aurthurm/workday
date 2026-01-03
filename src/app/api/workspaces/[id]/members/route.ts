import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser, getOrgMembership, getWorkspaceById } from "@/lib/data";
import { parseJson, parseSearchParams, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const workspace = getWorkspaceById(id);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, id);
  let hasAccess = Boolean(membership);
  if (!hasAccess && workspace.org_id) {
    const orgMembership = getOrgMembership(session.userId, workspace.org_id);
    hasAccess = Boolean(orgMembership && orgMembership.status === "active");
  }
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const members = db
    .prepare(
      "SELECT memberships.id, memberships.user_id, memberships.role, users.name, users.email FROM memberships JOIN users ON users.id = memberships.user_id WHERE memberships.workspace_id = ? ORDER BY users.name"
    )
    .all(id) as Array<{
    id: string;
    user_id: string;
    role: string;
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
  const workspace = getWorkspaceById(id);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  let canManage = false;
  if (workspace.org_id) {
    const orgMembership = getOrgMembership(session.userId, workspace.org_id);
    canManage = Boolean(
      orgMembership && ["owner", "admin", "supervisor"].includes(orgMembership.role)
    );
  } else {
    const membership = getMembershipForUser(session.userId, id);
    canManage = Boolean(membership?.role === "admin");
  }
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseJson(
    request,
    z.object({
      userId: uuidSchema,
      role: z.enum(["member", "supervisor", "admin"]).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const role = parsed.data.role ?? "member";
  db.prepare(
    "INSERT OR IGNORE INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(randomUUID(), parsed.data.userId, id, role, new Date().toISOString());

  logEvent({
    event: "workspaces.members.added",
    message: "Workspace member added.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: id, memberId: parsed.data.userId, role },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const workspace = getWorkspaceById(id);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  let canManage = false;
  if (workspace.org_id) {
    const orgMembership = getOrgMembership(session.userId, workspace.org_id);
    canManage = Boolean(
      orgMembership && ["owner", "admin", "supervisor"].includes(orgMembership.role)
    );
  } else {
    const membership = getMembershipForUser(session.userId, id);
    canManage = Boolean(membership?.role === "admin");
  }
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(searchParams, z.object({ userId: uuidSchema }));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const userId = parsed.data.userId;

  db.prepare("DELETE FROM memberships WHERE workspace_id = ? AND user_id = ?").run(
    id,
    userId
  );

  logEvent({
    event: "workspaces.members.removed",
    message: "Workspace member removed.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: id, memberId: userId },
  });

  return NextResponse.json({ ok: true });
}

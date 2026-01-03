import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser, getOrgMembership, getWorkspaceById } from "@/lib/data";
import { parseJson, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();

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

  const membership = getMembershipForUser(session.userId, id);
  let hasAdminAccess = membership?.role === "admin";
  if (!hasAdminAccess && workspace.org_id) {
    const orgMembership = getOrgMembership(session.userId, workspace.org_id);
    hasAdminAccess = Boolean(
      orgMembership && ["owner", "admin"].includes(orgMembership.role)
    );
  }
  if (!hasAdminAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseJson(
    request,
    z.object({ transferWorkspaceId: uuidSchema })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const transferWorkspaceId = parsed.data.transferWorkspaceId;
  if (transferWorkspaceId === id) {
    return NextResponse.json(
      { error: "Transfer workspace must be different." },
      { status: 400 }
    );
  }

  const target = getWorkspaceById(transferWorkspaceId);
  if (!target) {
    return NextResponse.json(
      { error: "Transfer workspace not found." },
      { status: 404 }
    );
  }

  if (workspace.type !== target.type) {
    return NextResponse.json(
      { error: "Transfer workspace must be the same type." },
      { status: 400 }
    );
  }

  if ((workspace.org_id ?? null) !== (target.org_id ?? null)) {
    return NextResponse.json(
      { error: "Transfer workspace must belong to the same organization." },
      { status: 400 }
    );
  }

  const targetMembership = getMembershipForUser(
    session.userId,
    transferWorkspaceId
  );
  let hasTargetAdmin = targetMembership?.role === "admin";
  if (!hasTargetAdmin && target.org_id) {
    const orgMembership = getOrgMembership(session.userId, target.org_id);
    hasTargetAdmin = Boolean(
      orgMembership && ["owner", "admin"].includes(orgMembership.role)
    );
  }
  if (!hasTargetAdmin) {
    return NextResponse.json(
      { error: "You need admin access to the transfer workspace." },
      { status: 403 }
    );
  }

  const categories = db
    .prepare("SELECT name, color FROM categories WHERE workspace_id = ?")
    .all(id) as Array<{ name: string; color: string }>;
  categories.forEach((category) => {
    db.prepare(
      "INSERT OR IGNORE INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(randomUUID(), transferWorkspaceId, category.name, category.color, now());
  });

  db.prepare("UPDATE daily_plans SET workspace_id = ? WHERE workspace_id = ?").run(
    transferWorkspaceId,
    id
  );
  db.prepare("UPDATE tasks SET workspace_id = ? WHERE workspace_id = ?").run(
    transferWorkspaceId,
    id
  );

  logEvent({
    event: "workspaces.transferred",
    message: "Workspace data transferred.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { fromWorkspaceId: id, toWorkspaceId: transferWorkspaceId },
  });

  return NextResponse.json({ ok: true });
}

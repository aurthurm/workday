import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getDefaultOrgWorkspace, getOrgMembership } from "@/lib/data";
import { randomUUID } from "crypto";
import { parseJson, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";
import { getEntitlements, limitValue } from "@/lib/entitlements";
import { limitReached } from "@/lib/entitlement-errors";

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

  const entitlements = getEntitlements(session.userId);
  if (!entitlements.isAdmin) {
    const limit = limitValue(entitlements, "limit.org_members");
    const count = db
      .prepare(
        "SELECT COUNT(*) as count FROM org_members WHERE org_id = ? AND status != 'disabled'"
      )
      .get(id) as { count: number };
    if (count.count >= limit) {
      return limitReached("limit.org_members", limit);
    }
  }

  const parsed = await parseJson(
    request,
    z.object({
      userId: uuidSchema,
      role: z.enum(["owner", "admin", "supervisor", "member"]).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const role = parsed.data.role ?? "member";

  db.prepare(
    "INSERT OR IGNORE INTO org_members (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)"
  ).run(randomUUID(), id, parsed.data.userId, role, new Date().toISOString());

  const defaultWorkspace = getDefaultOrgWorkspace(id);
  if (defaultWorkspace) {
    db.prepare(
      "INSERT OR IGNORE INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      parsed.data.userId,
      defaultWorkspace.id,
      role === "owner" || role === "admin" ? "admin" : "member",
      new Date().toISOString()
    );
  }

  logEvent({
    event: "orgs.members.added",
    message: "Organization member added.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { orgId: id, memberId: parsed.data.userId, role },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgMembership } from "@/lib/data";
import { parseJson, emailSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";
import { getEntitlements, limitValue } from "@/lib/entitlements";
import { limitReached } from "@/lib/entitlement-errors";

const now = () => new Date().toISOString();

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

  const invites = db
    .prepare(
      "SELECT id, email, role, token, expires_at, accepted_at, created_at FROM org_invites WHERE org_id = ? ORDER BY created_at DESC"
    )
    .all(id);

  return NextResponse.json({ invites });
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
    const memberCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM org_members WHERE org_id = ? AND status != 'disabled'"
      )
      .get(id) as { count: number };
    const inviteCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM org_invites WHERE org_id = ? AND accepted_at IS NULL"
      )
      .get(id) as { count: number };
    if (memberCount.count + inviteCount.count >= limit) {
      return limitReached("limit.org_members", limit);
    }
  }

  const parsed = await parseJson(
    request,
    z.object({
      email: emailSchema,
      role: z.enum(["owner", "admin", "supervisor", "member"]).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();
  const role = parsed.data.role ?? "member";

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO org_invites (id, org_id, email, role, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), id, email, role, token, expiresAt, now());

  logEvent({
    event: "orgs.invites.created",
    message: "Organization invite created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { orgId: id, email, role },
  });

  return NextResponse.json({ ok: true, token });
}

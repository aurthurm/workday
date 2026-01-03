import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { addOrgMember, getDefaultOrgWorkspace } from "@/lib/data";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(
    request,
    z.object({ token: z.string().trim().min(1).max(120) })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const token = parsed.data.token;

  const invite = db
    .prepare(
      "SELECT id, org_id, email, role, expires_at, accepted_at FROM org_invites WHERE token = ?"
    )
    .get(token) as
    | {
        id: string;
        org_id: string;
        email: string;
        role: string;
        expires_at: string;
        accepted_at: string | null;
      }
    | undefined;

  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.accepted_at) {
    return NextResponse.json({ error: "Invite already accepted." }, { status: 409 });
  }
  if (invite.expires_at < now()) {
    return NextResponse.json({ error: "Invite expired." }, { status: 410 });
  }
  if (invite.email.toLowerCase() !== session.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Invite email does not match your account." },
      { status: 403 }
    );
  }

  addOrgMember({
    orgId: invite.org_id,
    userId: session.userId,
    role: invite.role as "owner" | "admin" | "supervisor" | "member",
    status: "active",
  });

  const defaultWorkspace = getDefaultOrgWorkspace(invite.org_id);
  if (defaultWorkspace) {
    db.prepare(
      "INSERT OR IGNORE INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      session.userId,
      defaultWorkspace.id,
      invite.role === "owner" || invite.role === "admin" ? "admin" : "member",
      now()
    );
  }

  db.prepare("UPDATE org_invites SET accepted_at = ? WHERE id = ?").run(
    now(),
    invite.id
  );

  logEvent({
    event: "orgs.invites.accepted",
    message: "Organization invite accepted.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { orgId: invite.org_id, inviteId: invite.id },
  });

  return NextResponse.json({ ok: true });
}

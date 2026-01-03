import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date().toISOString();
  const invites = db
    .prepare(
      `SELECT org_invites.id,
              org_invites.org_id,
              organizations.name as org_name,
              org_invites.role,
              org_invites.token,
              org_invites.expires_at,
              org_invites.created_at
       FROM org_invites
       JOIN organizations ON organizations.id = org_invites.org_id
       WHERE LOWER(org_invites.email) = LOWER(?)
         AND org_invites.accepted_at IS NULL
         AND org_invites.expires_at > ?
       ORDER BY org_invites.created_at DESC`
    )
    .all(session.email, now) as Array<{
    id: string;
    org_id: string;
    org_name: string;
    role: string;
    token: string;
    expires_at: string;
    created_at: string;
  }>;

  return NextResponse.json({ invites });
}

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOrgMembership } from "@/lib/data";

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

  const body = (await request.json()) as {
    email?: string;
    role?: "owner" | "admin" | "supervisor" | "member";
  };
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const role = body.role ?? "member";

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    "INSERT INTO org_invites (id, org_id, email, role, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(randomUUID(), id, email, role, token, expiresAt, now());

  return NextResponse.json({ ok: true, token });
}

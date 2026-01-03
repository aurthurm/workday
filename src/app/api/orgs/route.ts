import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  addOrgMember,
  createOrganization,
  createWorkspace,
  listOrganizationsForUser,
} from "@/lib/data";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const orgs = listOrganizationsForUser(session.userId);
  return NextResponse.json({ orgs });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { name?: string; slug?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
  }
  const slug = slugify(body.slug?.trim() || name);
  if (!slug) {
    return NextResponse.json({ error: "Organization slug is required." }, { status: 400 });
  }

  const existing = db
    .prepare("SELECT id FROM organizations WHERE slug = ?")
    .get(slug) as { id: string } | undefined;
  if (existing) {
    return NextResponse.json({ error: "Organization slug already exists." }, { status: 409 });
  }

  const orgId = createOrganization({
    name,
    slug,
    createdBy: session.userId,
  });
  addOrgMember({ orgId, userId: session.userId, role: "owner", status: "active" });

  const workspaceId = createWorkspace({
    name: `${name} General`,
    type: "organization",
    orgId,
    isDefault: 1,
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

  return NextResponse.json({ id: orgId, name, slug, defaultWorkspaceId: workspaceId });
}

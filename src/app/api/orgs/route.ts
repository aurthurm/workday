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
import { getEntitlements, limitValue } from "@/lib/entitlements";
import { limitReached } from "@/lib/entitlement-errors";
import { parseJson, nameSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

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

  const entitlements = getEntitlements(session.userId);
  if (!entitlements.isAdmin) {
    const limit = limitValue(entitlements, "limit.organizations");
    const orgCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM org_members WHERE user_id = ? AND status = 'active'"
      )
      .get(session.userId) as { count: number };
    if (orgCount.count >= limit) {
      return limitReached("limit.organizations", limit);
    }
  }

  const parsed = await parseJson(
    request,
    z.object({
      name: nameSchema,
      slug: z.string().trim().max(80).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const name = parsed.data.name;
  const slug = slugify(parsed.data.slug || name);
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

  logEvent({
    event: "orgs.created",
    message: "Organization created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { orgId, workspaceId },
  });

  return NextResponse.json({ id: orgId, name, slug, defaultWorkspaceId: workspaceId });
}

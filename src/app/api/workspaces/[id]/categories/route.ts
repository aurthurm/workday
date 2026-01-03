import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser, getOrgMembership, getWorkspaceById } from "@/lib/data";
import { parseJson, parseSearchParams, categorySchema, colorSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const resolveRole = (workspaceId: string, orgId: string | null, userId: string) => {
  const membership = getMembershipForUser(userId, workspaceId);
  if (membership) {
    return { canAccess: true, role: membership.role };
  }
  if (orgId) {
    const orgMembership = getOrgMembership(userId, orgId);
    if (orgMembership && orgMembership.status === "active") {
      const elevated = ["owner", "admin", "supervisor"].includes(
        orgMembership.role
      );
      return { canAccess: true, role: elevated ? "admin" : "member" };
    }
  }
  return { canAccess: false, role: "member" };
};

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

  const { canAccess, role } = resolveRole(
    workspace.id,
    workspace.org_id ?? null,
    session.userId
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const categories = db
    .prepare(
      "SELECT id, name, color FROM categories WHERE workspace_id = ? ORDER BY name ASC"
    )
    .all(workspace.id);

  return NextResponse.json({ categories, role });
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

  const { canAccess, role } = resolveRole(
    workspace.id,
    workspace.org_id ?? null,
    session.userId
  );
  if (!canAccess || role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseJson(
    request,
    z.object({
      name: categorySchema,
      color: colorSchema.optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const name = parsed.data.name;
  const color = parsed.data.color ?? "#64748b";

  const idValue = randomUUID();
  db.prepare(
    "INSERT INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(idValue, workspace.id, name, color, new Date().toISOString());

  logEvent({
    event: "categories.created",
    message: "Category created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: workspace.id, categoryId: idValue },
  });

  return NextResponse.json({ id: idValue, name, color });
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

  const { canAccess, role } = resolveRole(
    workspace.id,
    workspace.org_id ?? null,
    session.userId
  );
  if (!canAccess || role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(searchParams, z.object({ id: uuidSchema }));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const categoryId = parsed.data.id;

  const category = db
    .prepare("SELECT id, name FROM categories WHERE id = ? AND workspace_id = ?")
    .get(categoryId, workspace.id) as { id: string; name: string } | undefined;
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const usage = db
    .prepare("SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND category = ?")
    .get(workspace.id, category.name) as { count: number };
  if (usage.count > 0) {
    return NextResponse.json(
      { error: "Category is in use and cannot be deleted." },
      { status: 409 }
    );
  }

  db.prepare("DELETE FROM categories WHERE id = ? AND workspace_id = ?").run(
    categoryId,
    workspace.id
  );

  logEvent({
    event: "categories.deleted",
    message: "Category deleted.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: workspace.id, categoryId },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(
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

  const { canAccess, role } = resolveRole(
    workspace.id,
    workspace.org_id ?? null,
    session.userId
  );
  if (!canAccess || role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const bodyParsed = await parseJson(
    request,
    z.object({
      id: uuidSchema,
      name: categorySchema.optional(),
      color: colorSchema.optional(),
    })
  );
  if (!bodyParsed.ok) {
    return NextResponse.json({ error: bodyParsed.error }, { status: 400 });
  }
  const categoryId = bodyParsed.data.id;

  const existing = db
    .prepare(
      "SELECT id, name, color FROM categories WHERE id = ? AND workspace_id = ?"
    )
    .get(categoryId, workspace.id) as
    | { id: string; name: string; color: string }
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const nextName = bodyParsed.data.name ?? existing.name;
  const nextColor = bodyParsed.data.color ?? existing.color;

  try {
    db.prepare(
      "UPDATE categories SET name = ?, color = ? WHERE id = ? AND workspace_id = ?"
    ).run(nextName, nextColor, categoryId, workspace.id);
  } catch {
    return NextResponse.json(
      { error: "Category name already exists." },
      { status: 409 }
    );
  }

  if (nextName !== existing.name) {
    db.prepare(
      "UPDATE tasks SET category = ? WHERE category = ? AND workspace_id = ?"
    ).run(nextName, existing.name, workspace.id);
  }

  logEvent({
    event: "categories.updated",
    message: "Category updated.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: workspace.id, categoryId },
  });

  return NextResponse.json({ id: categoryId, name: nextName, color: nextColor });
}

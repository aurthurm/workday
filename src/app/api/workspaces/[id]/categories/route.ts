import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser, getOrgMembership, getWorkspaceById } from "@/lib/data";

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

  const body = (await request.json()) as { name?: string; color?: string };
  const name = body.name?.trim();
  const color = body.color?.trim() || "#64748b";
  if (!name) {
    return NextResponse.json(
      { error: "Category name is required." },
      { status: 400 }
    );
  }

  const idValue = randomUUID();
  db.prepare(
    "INSERT INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(idValue, workspace.id, name, color, new Date().toISOString());

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
  const categoryId = searchParams.get("id");
  if (!categoryId) {
    return NextResponse.json({ error: "Category id is required." }, { status: 400 });
  }

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

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    color?: string;
  };
  const categoryId = body.id?.trim();
  if (!categoryId) {
    return NextResponse.json({ error: "Category id is required." }, { status: 400 });
  }

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

  const nextName = body.name?.trim() || existing.name;
  const nextColor = body.color?.trim() || existing.color;

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

  return NextResponse.json({ id: categoryId, name: nextName, color: nextColor });
}

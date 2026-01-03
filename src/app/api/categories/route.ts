import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const categories = db
    .prepare(
      "SELECT id, name, color FROM categories WHERE workspace_id = ? ORDER BY name ASC"
    )
    .all(active.workspace.id);

  return NextResponse.json({ categories, role: active.membership.role });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (active.membership.role === "member") {
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

  const id = randomUUID();
  db.prepare(
    "INSERT INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, active.workspace.id, name, color, new Date().toISOString());

  return NextResponse.json({ id, name, color });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (active.membership.role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Category id is required." }, { status: 400 });
  }

  const category = db
    .prepare("SELECT id, name FROM categories WHERE id = ? AND workspace_id = ?")
    .get(id, active.workspace.id) as { id: string; name: string } | undefined;
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const usage = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM tasks t
       JOIN daily_plans p ON p.id = t.daily_plan_id
       WHERE p.workspace_id = ? AND t.category = ?`
    )
    .get(active.workspace.id, category.name) as { count: number };
  if (usage.count > 0) {
    return NextResponse.json(
      { error: "Category is in use and cannot be deleted." },
      { status: 409 }
    );
  }

  db.prepare("DELETE FROM categories WHERE id = ? AND workspace_id = ?").run(
    id,
    active.workspace.id
  );

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (active.membership.role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    color?: string;
  };
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Category id is required." }, { status: 400 });
  }

  const existing = db
    .prepare(
      "SELECT id, name, color FROM categories WHERE id = ? AND workspace_id = ?"
    )
    .get(id, active.workspace.id) as
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
    ).run(nextName, nextColor, id, active.workspace.id);
  } catch (error) {
    return NextResponse.json(
      { error: "Category name already exists." },
      { status: 409 }
    );
  }

  if (nextName !== existing.name) {
    db.prepare(
      `UPDATE tasks
       SET category = ?
       WHERE category = ?
       AND daily_plan_id IN (
         SELECT id FROM daily_plans WHERE workspace_id = ?
       )`
    ).run(nextName, existing.name, active.workspace.id);
  }

  return NextResponse.json({ id, name: nextName, color: nextColor });
}

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
      "SELECT id, name FROM categories WHERE workspace_id = ? ORDER BY name ASC"
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

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Category name is required." },
      { status: 400 }
    );
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO categories (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, active.workspace.id, name, new Date().toISOString());

  return NextResponse.json({ id, name });
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

  db.prepare("DELETE FROM categories WHERE id = ? AND workspace_id = ?").run(
    id,
    active.workspace.id
  );

  return NextResponse.json({ ok: true });
}

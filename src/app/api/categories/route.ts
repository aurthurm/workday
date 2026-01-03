import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { parseJson, parseSearchParams, categorySchema, colorSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";
import { getEntitlements, limitValue } from "@/lib/entitlements";
import { limitReached } from "@/lib/entitlement-errors";

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

  const entitlements = getEntitlements(session.userId);
  if (!entitlements.isAdmin) {
    const limit = limitValue(entitlements, "limit.categories_per_workspace");
    const count = db
      .prepare("SELECT COUNT(*) as count FROM categories WHERE workspace_id = ?")
      .get(active.workspace.id) as { count: number };
    if (count.count >= limit) {
      return limitReached("limit.categories_per_workspace", limit);
    }
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

  const id = randomUUID();
  db.prepare(
    "INSERT INTO categories (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, active.workspace.id, name, color, new Date().toISOString());

  logEvent({
    event: "categories.created",
    message: "Category created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: active.workspace.id, categoryId: id },
  });

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
  const parsed = parseSearchParams(searchParams, z.object({ id: uuidSchema }));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const id = parsed.data.id;

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

  logEvent({
    event: "categories.deleted",
    message: "Category deleted.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: active.workspace.id, categoryId: id },
  });

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
  const id = bodyParsed.data.id;

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

  const nextName = bodyParsed.data.name ?? existing.name;
  const nextColor = bodyParsed.data.color ?? existing.color;

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

  logEvent({
    event: "categories.updated",
    message: "Category updated.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: active.workspace.id, categoryId: id },
  });

  return NextResponse.json({ id, name: nextName, color: nextColor });
}

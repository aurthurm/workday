import { NextResponse } from "next/server";
import {
  createMembership,
  createWorkspace,
  getActiveWorkspace,
  listMembershipsForUser,
} from "@/lib/data";
import { getSession, getWorkspaceCookie, setWorkspaceCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { parseJson, nameSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const memberships = listMembershipsForUser(session.userId);
  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());

  return NextResponse.json({
    workspaces: memberships.map((membership) => ({
      id: membership.workspace_id,
      name: membership.name,
      type: membership.type,
      role: membership.role,
      org_id: membership.org_id,
      is_default: membership.is_default,
    })),
    activeWorkspaceId: active?.workspace?.id ?? null,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(
    request,
    z.object({
      name: nameSchema,
      type: z.enum(["personal", "organization"]).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const name = parsed.data.name;
  const type = parsed.data.type ?? "organization";
  if (type !== "personal") {
    const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
    if (!active || active.membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create workspaces." },
        { status: 403 }
      );
    }
  }

  const workspaceId = createWorkspace({
    name,
    type,
  });
  createMembership({ userId: session.userId, workspaceId, role: "admin" });
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
  await setWorkspaceCookie(workspaceId);

  logEvent({
    event: "workspaces.created",
    message: "Workspace created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId, type },
  });

  return NextResponse.json({ id: workspaceId, name, type });
}

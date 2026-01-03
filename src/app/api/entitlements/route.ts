import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { getEntitlements } from "@/lib/entitlements";
import { parseSearchParams, uuidSchema } from "@/lib/validation";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ workspaceId: uuidSchema.optional() })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const active = getActiveWorkspace(
    session.userId,
    parsed.data.workspaceId ?? (await getWorkspaceCookie())
  );
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const entitlements = getEntitlements(session.userId);

  const personalWorkspaces = db
    .prepare(
      "SELECT COUNT(*) as count FROM memberships m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? AND w.type = 'personal'"
    )
    .get(session.userId) as { count: number };
  const organizations = db
    .prepare(
      "SELECT COUNT(*) as count FROM org_members WHERE user_id = ? AND status = 'active'"
    )
    .get(session.userId) as { count: number };
  const orgWorkspaces = active.workspace.org_id
    ? (db
        .prepare(
          "SELECT COUNT(*) as count FROM workspaces WHERE org_id = ?"
        )
        .get(active.workspace.org_id) as { count: number }).count
    : 0;
  const categories = db
    .prepare(
      "SELECT COUNT(*) as count FROM categories WHERE workspace_id = ?"
    )
    .get(active.workspace.id) as { count: number };
  const orgMembers = active.workspace.org_id
    ? (db
        .prepare(
          "SELECT COUNT(*) as count FROM org_members WHERE org_id = ? AND status = 'active'"
        )
        .get(active.workspace.org_id) as { count: number }).count
    : 0;

  return NextResponse.json({
    entitlements,
    usage: {
      personal_workspaces: personalWorkspaces.count,
      organizations: organizations.count,
      org_workspaces_per_org: orgWorkspaces,
      categories_per_workspace: categories.count,
      org_members: orgMembers,
    },
    workspace: {
      id: active.workspace.id,
      type: active.workspace.type,
      org_id: active.workspace.org_id ?? null,
    },
  });
}

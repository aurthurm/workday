import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById, listMembershipsForUser } from "@/lib/data";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const memberships = listMembershipsForUser(session.userId);
  return NextResponse.json({
    user,
    memberships: memberships.map((membership) => ({
      workspaceId: membership.workspace_id,
      workspaceName: membership.name,
      workspaceType: membership.type,
      role: membership.role,
    })),
  });
}

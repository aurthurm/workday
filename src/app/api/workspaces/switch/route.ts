import { NextResponse } from "next/server";
import { getMembershipForUser } from "@/lib/data";
import { getSession, setWorkspaceCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as { workspaceId?: string };
  if (!body.workspaceId) {
    return NextResponse.json(
      { error: "Workspace id is required." },
      { status: 400 }
    );
  }

  const membership = getMembershipForUser(session.userId, body.workspaceId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of that workspace." },
      { status: 403 }
    );
  }

  await setWorkspaceCookie(body.workspaceId);
  return NextResponse.json({ ok: true });
}

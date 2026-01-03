import { NextResponse } from "next/server";
import { getMembershipForUser } from "@/lib/data";
import { getSession, setWorkspaceCookie } from "@/lib/auth";
import { parseJson, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(
    request,
    z.object({ workspaceId: uuidSchema })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const membership = getMembershipForUser(session.userId, body.workspaceId);
  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of that workspace." },
      { status: 403 }
    );
  }

  await setWorkspaceCookie(body.workspaceId);
  logEvent({
    event: "workspaces.switched",
    message: "Workspace switched.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { workspaceId: body.workspaceId },
  });
  return NextResponse.json({ ok: true });
}

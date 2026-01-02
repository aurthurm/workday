import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const plan = db
    .prepare("SELECT workspace_id FROM daily_plans WHERE id = ?")
    .get(id) as { workspace_id: string } | undefined;

  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, plan.workspace_id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const comments = db
    .prepare(
      "SELECT comments.id, comments.task_id, comments.content, comments.created_at, users.name as author_name FROM comments JOIN users ON users.id = comments.author_id WHERE comments.daily_plan_id = ? ORDER BY comments.created_at DESC"
    )
    .all(id);

  return NextResponse.json({ comments });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace, upsertDailyPlan } from "@/lib/data";
import { rolloverIncompleteTasks } from "@/lib/rollover";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Date is required." }, { status: 400 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const today = new Date().toISOString().slice(0, 10);
  if (date === today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    rolloverIncompleteTasks({
      userId: session.userId,
      workspaceId: active.workspace.id,
      fromDate: yesterdayKey,
      toDate: today,
    });
  }

  const plan = db
    .prepare(
      "SELECT id, user_id, workspace_id, date, visibility, submitted, reviewed FROM daily_plans WHERE user_id = ? AND workspace_id = ? AND date = ?"
    )
    .get(session.userId, active.workspace.id, date) as
    | {
        id: string;
        user_id: string;
        workspace_id: string;
        date: string;
        visibility: "team" | "private";
        submitted: number;
        reviewed: number;
      }
    | undefined;

  if (!plan) {
    return NextResponse.json({ plan: null });
  }

  const tasks = db
    .prepare(
      "SELECT id, daily_plan_id, title, category, estimated_minutes, actual_minutes, status, notes, start_time, end_time, position FROM tasks WHERE daily_plan_id = ? ORDER BY position ASC, created_at ASC"
    )
    .all(plan.id);

  const reflection = db
    .prepare(
      "SELECT what_went_well, blockers, tomorrow_focus FROM reflections WHERE daily_plan_id = ?"
    )
    .get(plan.id);

  const comments = db
    .prepare(
      "SELECT comments.id, comments.task_id, comments.content, comments.created_at, users.name as author_name FROM comments JOIN users ON users.id = comments.author_id WHERE comments.daily_plan_id = ? ORDER BY comments.created_at DESC"
    )
    .all(plan.id);

  return NextResponse.json({
    plan: {
      ...plan,
      submitted: Boolean(plan.submitted),
      reviewed: Boolean(plan.reviewed),
      tasks,
      reflection: reflection ?? {
        what_went_well: "",
        blockers: "",
        tomorrow_focus: "",
      },
      comments,
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    date?: string;
    visibility?: "team" | "private";
  };

  if (!body.date) {
    return NextResponse.json({ error: "Date is required." }, { status: 400 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const planId = upsertDailyPlan({
    userId: session.userId,
    workspaceId: active.workspace.id,
    date: body.date,
    visibility: body.visibility ?? "team",
  });

  return NextResponse.json({ id: planId });
}

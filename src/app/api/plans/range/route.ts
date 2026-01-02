import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json(
      { error: "Start and end dates are required." },
      { status: 400 }
    );
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const plans = db
    .prepare(
      `SELECT id,
              user_id,
              workspace_id,
              date,
              visibility,
              submitted,
              reviewed
       FROM daily_plans
       WHERE user_id = ? AND workspace_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`
    )
    .all(session.userId, active.workspace.id, start, end) as Array<{
    id: string;
    user_id: string;
    workspace_id: string;
    date: string;
    visibility: string;
    submitted: number;
    reviewed: number;
  }>;

  if (plans.length === 0) {
    return NextResponse.json({ plans: [] });
  }

  const planIds = plans.map((plan) => plan.id);
  const placeholders = planIds.map(() => "?").join(",");

  const tasks = db
    .prepare(
      `SELECT id,
              daily_plan_id,
              title,
              category,
              status,
              estimated_minutes,
              actual_minutes,
              start_time,
              end_time
       FROM tasks
       WHERE daily_plan_id IN (${placeholders})
       ORDER BY position ASC, created_at ASC`
    )
    .all(...planIds) as Array<{
    id: string;
    daily_plan_id: string;
    title: string;
    category: string;
    status: string;
    estimated_minutes: number | null;
    actual_minutes: number | null;
    start_time: string | null;
    end_time: string | null;
  }>;

  const tasksMap = tasks.reduce<Record<string, typeof tasks>>((acc, task) => {
    acc[task.daily_plan_id] = acc[task.daily_plan_id] || [];
    acc[task.daily_plan_id].push(task);
    return acc;
  }, {});

  const enrichedPlans = plans.map((plan) => ({
    ...plan,
    tasks: tasksMap[plan.id] ?? [],
  }));

  return NextResponse.json({ plans: enrichedPlans });
}

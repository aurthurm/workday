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
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "Date is required." }, { status: 400 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  if (active.membership.role === "member") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const plans = db
    .prepare(
      `SELECT daily_plans.id,
              daily_plans.user_id,
              daily_plans.date,
              daily_plans.visibility,
              daily_plans.submitted,
              daily_plans.reviewed,
              users.name as user_name,
              users.email as user_email,
              (SELECT COUNT(*) FROM tasks WHERE tasks.daily_plan_id = daily_plans.id) as task_total,
              (SELECT COUNT(*) FROM tasks WHERE tasks.daily_plan_id = daily_plans.id AND tasks.status = 'done') as task_done
       FROM daily_plans
       JOIN users ON users.id = daily_plans.user_id
       WHERE daily_plans.workspace_id = ? AND daily_plans.date = ?
       ORDER BY users.name ASC`
    )
    .all(active.workspace.id, date) as Array<{
    id: string;
    user_id: string;
    date: string;
    visibility: string;
    submitted: number;
    reviewed: number;
    user_name: string;
    user_email: string;
    task_total: number;
    task_done: number;
  }>;

  const tasksByPlan = db
    .prepare(
      "SELECT id, daily_plan_id, title, category, status, estimated_minutes, actual_minutes, start_time, end_time FROM tasks WHERE daily_plan_id IN (SELECT id FROM daily_plans WHERE workspace_id = ? AND date = ?) ORDER BY position ASC, created_at ASC"
    )
    .all(active.workspace.id, date) as Array<{
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

  const commentsByPlan = db
    .prepare(
      "SELECT comments.id, comments.daily_plan_id, comments.task_id, comments.content, comments.created_at, users.name as author_name FROM comments JOIN users ON users.id = comments.author_id WHERE comments.daily_plan_id IN (SELECT id FROM daily_plans WHERE workspace_id = ? AND date = ?) ORDER BY comments.created_at DESC"
    )
    .all(active.workspace.id, date) as Array<{
    id: string;
    daily_plan_id: string;
    task_id: string | null;
    content: string;
    created_at: string;
    author_name: string;
  }>;

  const tasksMap = tasksByPlan.reduce<Record<string, typeof tasksByPlan>>(
    (acc, task) => {
      acc[task.daily_plan_id] = acc[task.daily_plan_id] || [];
      acc[task.daily_plan_id].push(task);
      return acc;
    },
    {}
  );

  const commentsMap = commentsByPlan.reduce<
    Record<string, typeof commentsByPlan>
  >((acc, comment) => {
    acc[comment.daily_plan_id] = acc[comment.daily_plan_id] || [];
    acc[comment.daily_plan_id].push(comment);
    return acc;
  }, {});

  const enrichedPlans = plans.map((plan) => ({
    ...plan,
    tasks: tasksMap[plan.id] ?? [],
    comments: commentsMap[plan.id] ?? [],
  }));

  return NextResponse.json({ plans: enrichedPlans });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { parseSearchParams, dateSchema } from "@/lib/validation";
import { z } from "zod";
import { getEntitlements, featureAllowed } from "@/lib/entitlements";
import { featureNotAvailable } from "@/lib/entitlement-errors";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({
      limit: z.coerce.number().int().min(1).max(100).optional(),
      filter: z.enum(["history", "future", "all"]).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const limit = parsed.data.limit ?? 21;
  const filter = parsed.data.filter ?? "history";
  const entitlements = getEntitlements(session.userId);
  if (
    (filter === "future" || filter === "all") &&
    !featureAllowed(entitlements, "feature.future_plans")
  ) {
    return featureNotAvailable("feature.future_plans");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!dateSchema.safeParse(today).success) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  const comparatorMap = {
    future: ">=",
    all: "!=",
    history: "<=",
  } as const;
  const comparator = comparatorMap[filter];

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const plans = db
    .prepare(
      `SELECT daily_plans.id,
              daily_plans.date,
              daily_plans.submitted,
              daily_plans.visibility,
              (SELECT COUNT(*) FROM tasks WHERE tasks.daily_plan_id = daily_plans.id) as task_total,
              (SELECT COUNT(*) FROM tasks WHERE tasks.daily_plan_id = daily_plans.id AND tasks.status = 'done') as task_done
       FROM daily_plans
       WHERE daily_plans.user_id = ? AND daily_plans.workspace_id = ?
         AND daily_plans.date ${comparator} ?
       ORDER BY daily_plans.date DESC
       LIMIT ?`
    )
    .all(session.userId, active.workspace.id, today, limit) as Array<{
    id: string;
    date: string;
    submitted: number;
    visibility: string;
    task_total: number;
    task_done: number;
  }>;

  const tasksByPlan = db
    .prepare(
      `SELECT id,
              daily_plan_id,
              title,
              category,
              status,
              estimated_minutes,
              actual_minutes,
              notes,
              priority,
              due_date,
              recurrence_rule,
              recurrence_time,
              repeat_till,
              start_time,
              end_time
       FROM tasks
       WHERE daily_plan_id IN (
         SELECT id
         FROM daily_plans
         WHERE user_id = ? AND workspace_id = ? AND date ${comparator} ?
         ORDER BY date DESC
         LIMIT ?
       )
       ORDER BY position ASC, created_at ASC`
    )
    .all(session.userId, active.workspace.id, today, limit) as Array<{
    id: string;
    daily_plan_id: string;
    title: string;
    category: string;
    status: string;
    estimated_minutes: number | null;
    actual_minutes: number | null;
    notes: string | null;
    priority: string | null;
    due_date: string | null;
    recurrence_rule: string | null;
    recurrence_time: string | null;
    repeat_till: string | null;
    start_time: string | null;
    end_time: string | null;
  }>;

  const commentsByPlan = db
    .prepare(
      `SELECT comments.id,
              comments.daily_plan_id,
              comments.task_id,
              comments.content,
              comments.created_at,
              users.name as author_name
       FROM comments
       JOIN users ON users.id = comments.author_id
       WHERE comments.daily_plan_id IN (
         SELECT id
         FROM daily_plans
         WHERE user_id = ? AND workspace_id = ? AND date ${comparator} ?
         ORDER BY date DESC
         LIMIT ?
       )
       ORDER BY comments.created_at DESC`
    )
    .all(session.userId, active.workspace.id, today, limit) as Array<{
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

  const taskIds = tasksByPlan.map((task) => task.id);
  const attachmentsByTask = new Map<string, Array<{ id: string; url: string }>>();
  const subtasksByTask = new Map<
    string,
    Array<{
      id: string;
      title: string;
      completed: number;
      estimated_minutes: number | null;
      actual_minutes: number | null;
      start_time: string | null;
      end_time: string | null;
    }>
  >();
  if (taskIds.length > 0) {
    const placeholders = taskIds.map(() => "?").join(",");
    const attachments = db
      .prepare(
        `SELECT id, task_id, url FROM task_attachments WHERE task_id IN (${placeholders}) ORDER BY created_at DESC`
      )
      .all(...taskIds) as Array<{ id: string; task_id: string; url: string }>;
    attachments.forEach((attachment) => {
      const list = attachmentsByTask.get(attachment.task_id) ?? [];
      list.push({ id: attachment.id, url: attachment.url });
      attachmentsByTask.set(attachment.task_id, list);
    });

    const subtasks = db
      .prepare(
        `SELECT id, task_id, title, completed, estimated_minutes, actual_minutes, start_time, end_time FROM task_subtasks WHERE task_id IN (${placeholders}) ORDER BY created_at ASC`
      )
      .all(...taskIds) as Array<{
        id: string;
        task_id: string;
        title: string;
        completed: number;
        estimated_minutes: number | null;
        actual_minutes: number | null;
        start_time: string | null;
        end_time: string | null;
      }>;
    subtasks.forEach((subtask) => {
      const list = subtasksByTask.get(subtask.task_id) ?? [];
      list.push({
        id: subtask.id,
        title: subtask.title,
        completed: subtask.completed,
        estimated_minutes: subtask.estimated_minutes,
        actual_minutes: subtask.actual_minutes,
        start_time: subtask.start_time,
        end_time: subtask.end_time,
      });
      subtasksByTask.set(subtask.task_id, list);
    });
  }

  const commentsMap = commentsByPlan.reduce<
    Record<string, typeof commentsByPlan>
  >((acc, comment) => {
    acc[comment.daily_plan_id] = acc[comment.daily_plan_id] || [];
    acc[comment.daily_plan_id].push(comment);
    return acc;
  }, {});

  const enrichedPlans = plans.map((plan) => ({
    ...plan,
    tasks: (tasksMap[plan.id] ?? []).map((task) => ({
      ...task,
      attachments: attachmentsByTask.get(task.id) ?? [],
      subtasks: subtasksByTask.get(task.id) ?? [],
    })),
    comments: commentsMap[plan.id] ?? [],
  }));

  return NextResponse.json({ plans: enrichedPlans });
}

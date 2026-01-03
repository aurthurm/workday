import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace, upsertDailyPlan } from "@/lib/data";
import { rolloverIncompleteTasks } from "@/lib/rollover";

const isWeekday = (date: Date) => {
  const day = date.getDay();
  return day >= 1 && day <= 5;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getWeekdayOccurrenceInMonth = (date: Date) => {
  const weekday = date.getDay();
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  let count = 0;
  for (
    let d = new Date(firstOfMonth);
    d.getMonth() === date.getMonth();
    d.setDate(d.getDate() + 1)
  ) {
    if (d.getDay() === weekday) {
      count++;
      if (isSameDay(d, date)) {
        return count;
      }
    }
  }
  return 0;
};

const matchesRecurrence = (rule: string, startDate: string, targetDate: string) => {
  const start = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  if (target < start) return false;
  switch (rule) {
    case "daily_weekdays":
      return isWeekday(target);
    case "weekly":
      return start.getDay() === target.getDay();
    case "biweekly": {
      const diff = Math.floor((target.getTime() - start.getTime()) / 86400000);
      return diff % 14 === 0 && start.getDay() === target.getDay();
    }
    case "monthly": {
      const nth = getWeekdayOccurrenceInMonth(start);
      return (
        start.getDay() === target.getDay() &&
        getWeekdayOccurrenceInMonth(target) === nth
      );
    }
    case "monthly_nth_weekday":
      return (
        start.getDay() === target.getDay() &&
        getWeekdayOccurrenceInMonth(target) === 2
      );
    case "quarterly":
      return (
        start.getDay() === target.getDay() &&
        getWeekdayOccurrenceInMonth(target) === getWeekdayOccurrenceInMonth(start) &&
        (target.getMonth() - start.getMonth() + 12) % 3 === 0
      );
    case "yearly":
      return (
        start.getDay() === target.getDay() &&
        getWeekdayOccurrenceInMonth(target) === getWeekdayOccurrenceInMonth(start) &&
        start.getMonth() === target.getMonth()
      );
    case "specific_time":
      return true;
    case "custom":
      return false;
    default:
      return false;
  }
};

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

  let plan = db
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

  const recurringTemplates = db
    .prepare(
      `SELECT id, title, category, estimated_minutes, status, notes, priority, recurrence_rule, recurrence_time, recurrence_active, recurrence_start_date, repeat_till
       FROM tasks
       WHERE user_id = ? AND workspace_id = ?
         AND recurrence_rule IS NOT NULL
         AND recurrence_active = 1
         AND recurrence_parent_id IS NULL`
    )
    .all(session.userId, active.workspace.id) as Array<{
      id: string;
      title: string;
      category: string;
      estimated_minutes: number | null;
      status: string;
      notes: string | null;
      priority: string | null;
      recurrence_rule: string;
      recurrence_time: string | null;
      recurrence_active: number;
      recurrence_start_date: string | null;
      repeat_till: string | null;
    }>;

  if (!plan) {
    const matchesAny = recurringTemplates.some((template) => {
      if (!template.recurrence_start_date) return false;
      if (template.repeat_till && date > template.repeat_till) {
        return false;
      }
      return matchesRecurrence(
        template.recurrence_rule,
        template.recurrence_start_date,
        date
      );
    });

    if (!matchesAny) {
      return NextResponse.json({ plan: null });
    }

    const planId = upsertDailyPlan({
      userId: session.userId,
      workspaceId: active.workspace.id,
      date,
      visibility: "team",
    });
    plan = {
      id: planId,
      user_id: session.userId,
      workspace_id: active.workspace.id,
      date,
      visibility: "team",
      submitted: 0,
      reviewed: 0,
    };
  }

  recurringTemplates.forEach((template) => {
    if (!template.recurrence_start_date) return;
    if (template.repeat_till && date > template.repeat_till) {
      return;
    }
    if (!matchesRecurrence(template.recurrence_rule, template.recurrence_start_date, date)) {
      return;
    }
    const existing = db
      .prepare(
        "SELECT id FROM tasks WHERE daily_plan_id = ? AND recurrence_parent_id = ? LIMIT 1"
      )
      .get(plan.id, template.id) as { id: string } | undefined;
    if (existing) return;

    const positionRow = db
      .prepare("SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?")
      .get(plan.id) as { position: number | null };
    const position = (positionRow?.position ?? 0) + 1;
    const id = randomUUID();
    let startTimeIso: string | null = null;
    let endTimeIso: string | null = null;
    if (template.recurrence_time) {
      const startDate = new Date(`${date}T${template.recurrence_time}:00`);
      startTimeIso = startDate.toISOString();
      if (template.estimated_minutes) {
        endTimeIso = new Date(
          startDate.getTime() + template.estimated_minutes * 60 * 1000
        ).toISOString();
      }
    }

    db.prepare(
      `INSERT INTO tasks (
        id,
        daily_plan_id,
        user_id,
        workspace_id,
        title,
        category,
        estimated_minutes,
        actual_minutes,
        status,
        notes,
        priority,
        start_time,
        end_time,
        recurrence_rule,
        recurrence_time,
        recurrence_active,
        recurrence_parent_id,
        recurrence_start_date,
        position,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, 0, ?, NULL, ?, ?, ?)`
    ).run(
      id,
      plan.id,
      plan.user_id,
      plan.workspace_id,
      template.title,
      template.category,
      template.estimated_minutes,
      "planned",
      template.notes,
      template.priority ?? "none",
      startTimeIso,
      endTimeIso,
      template.id,
      position,
      new Date().toISOString(),
      new Date().toISOString()
    );
  });

  const tasks = db
    .prepare(
      "SELECT id, daily_plan_id, title, category, estimated_minutes, actual_minutes, status, notes, priority, due_date, repeat_till, start_time, end_time, recurrence_rule, recurrence_time, recurrence_active, recurrence_parent_id, recurrence_start_date, position FROM tasks WHERE daily_plan_id = ? ORDER BY position ASC, created_at ASC"
    )
    .all(plan.id) as Array<{ id: string; [key: string]: unknown }>;

  const taskIds = tasks.map((task: { id: string }) => task.id);
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
        estimated_minutes: subtask.estimated_minutes ?? null,
        actual_minutes: subtask.actual_minutes ?? null,
        start_time: subtask.start_time ?? null,
        end_time: subtask.end_time ?? null,
      });
      subtasksByTask.set(subtask.task_id, list);
    });
  }

  const enrichedTasks = tasks.map((task: any) => ({
    ...task,
    attachments: attachmentsByTask.get(task.id) ?? [],
    subtasks: subtasksByTask.get(task.id) ?? [],
  }));

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
      tasks: enrichedTasks,
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

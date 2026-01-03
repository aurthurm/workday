import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace, upsertDailyPlan } from "@/lib/data";
import { parseSearchParams, dateSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({
      start: dateSchema,
      end: dateSchema,
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { start, end } = parsed.data;
  if (end < start) {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }
  const defaultVisibility =
    active.workspace.type === "personal" ? "private" : "team";

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

  const isWeekday = (dateValue: Date) => {
    const day = dateValue.getDay();
    return day >= 1 && day <= 5;
  };
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const getWeekdayOccurrenceInMonth = (dateValue: Date) => {
    const weekday = dateValue.getDay();
    const firstOfMonth = new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
    let count = 0;
    for (
      let d = new Date(firstOfMonth);
      d.getMonth() === dateValue.getMonth();
      d.setDate(d.getDate() + 1)
    ) {
      if (d.getDay() === weekday) {
        count++;
        if (isSameDay(d, dateValue)) {
          return count;
        }
      }
    }
    return 0;
  };
  const matchesRecurrence = (rule: string, startDate: string, targetDate: string) => {
    const startDateValue = new Date(`${startDate}T00:00:00`);
    const targetDateValue = new Date(`${targetDate}T00:00:00`);
    if (targetDateValue < startDateValue) return false;
    switch (rule) {
      case "daily_weekdays":
        return isWeekday(targetDateValue);
      case "weekly":
        return startDateValue.getDay() === targetDateValue.getDay();
      case "biweekly": {
        const diff = Math.floor(
          (targetDateValue.getTime() - startDateValue.getTime()) / 86400000
        );
        return diff % 14 === 0 && startDateValue.getDay() === targetDateValue.getDay();
      }
      case "monthly": {
        const nth = getWeekdayOccurrenceInMonth(startDateValue);
        return (
          startDateValue.getDay() === targetDateValue.getDay() &&
          getWeekdayOccurrenceInMonth(targetDateValue) === nth
        );
      }
      case "monthly_nth_weekday":
        return (
          startDateValue.getDay() === targetDateValue.getDay() &&
          getWeekdayOccurrenceInMonth(targetDateValue) === 2
        );
      case "quarterly":
        return (
          startDateValue.getDay() === targetDateValue.getDay() &&
          getWeekdayOccurrenceInMonth(targetDateValue) ===
            getWeekdayOccurrenceInMonth(startDateValue) &&
          (targetDateValue.getMonth() - startDateValue.getMonth() + 12) % 3 === 0
        );
      case "yearly":
        return (
          startDateValue.getDay() === targetDateValue.getDay() &&
          getWeekdayOccurrenceInMonth(targetDateValue) ===
            getWeekdayOccurrenceInMonth(startDateValue) &&
          startDateValue.getMonth() === targetDateValue.getMonth()
        );
      case "specific_time":
        return true;
      case "custom":
        return false;
      default:
        return false;
    }
  };

  const buildDateRange = (startDate: string, endDate: string) => {
    const startValue = new Date(`${startDate}T00:00:00`);
    const endValue = new Date(`${endDate}T00:00:00`);
    const days: string[] = [];
    for (let cursor = new Date(startValue); cursor <= endValue; ) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  };

  const planByDate = new Map<string, (typeof plans)[number]>();
  plans.forEach((plan) => planByDate.set(plan.date, plan));

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

  const days = buildDateRange(start, end);
  for (const day of days) {
    for (const template of recurringTemplates) {
      if (!template.recurrence_start_date) continue;
      if (template.repeat_till && day > template.repeat_till) {
        continue;
      }
      if (!matchesRecurrence(template.recurrence_rule, template.recurrence_start_date, day)) {
        continue;
      }

      let plan = planByDate.get(day);
      if (!plan) {
        const planId = upsertDailyPlan({
          userId: session.userId,
          workspaceId: active.workspace.id,
          date: day,
          visibility: defaultVisibility,
        });
        plan = {
          id: planId,
          user_id: session.userId,
          workspace_id: active.workspace.id,
          date: day,
          visibility: defaultVisibility,
          submitted: 0,
          reviewed: 0,
        };
        planByDate.set(day, plan);
        plans.push(plan);
        logEvent({
          event: "plans.created",
          message: "Daily plan created.",
          userId: session.userId,
          ip: getClientIp(request),
          meta: { planId, date: day },
        });
      }

      const existing = db
        .prepare(
          "SELECT id FROM tasks WHERE daily_plan_id = ? AND recurrence_parent_id = ? LIMIT 1"
        )
        .get(plan.id, template.id) as { id: string } | undefined;
      if (existing) continue;

      const positionRow = db
        .prepare("SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?")
        .get(plan.id) as { position: number | null };
      const position = (positionRow?.position ?? 0) + 1;
      const taskId = randomUUID();
      let startTimeIso: string | null = null;
      let endTimeIso: string | null = null;
      if (template.recurrence_time) {
        const startDateValue = new Date(`${day}T${template.recurrence_time}:00`);
        startTimeIso = startDateValue.toISOString();
        if (template.estimated_minutes) {
          endTimeIso = new Date(
            startDateValue.getTime() + template.estimated_minutes * 60 * 1000
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
        taskId,
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
      logEvent({
        event: "tasks.recurrence.created",
        message: "Recurring task created.",
        userId: session.userId,
        ip: getClientIp(request),
        meta: { taskId, planId: plan.id, templateId: template.id },
      });
    }
  }

  plans.sort((a, b) => a.date.localeCompare(b.date));

  if (plans.length === 0) {
    return NextResponse.json({ plans: [] });
  }

  const planIds = plans.map((plan) => plan.id);
  const placeholders = planIds.map(() => "?").join(",");

  type TaskRow = {
    id: string;
    daily_plan_id: string;
    title: string;
    category: string;
    status: string;
    estimated_minutes: number | null;
    actual_minutes: number | null;
    due_date: string | null;
    recurrence_rule: string | null;
    repeat_till: string | null;
    start_time: string | null;
    end_time: string | null;
  };
  type SubtaskRow = {
    id: string;
    title: string;
    completed: number;
    estimated_minutes: number | null;
    actual_minutes: number | null;
    start_time: string | null;
    end_time: string | null;
  };

  const tasks = db
    .prepare(
      `SELECT id,
              daily_plan_id,
              title,
              category,
              status,
              estimated_minutes,
              actual_minutes,
              due_date,
              recurrence_rule,
              repeat_till,
              start_time,
              end_time
       FROM tasks
       WHERE daily_plan_id IN (${placeholders})
       ORDER BY position ASC, created_at ASC`
    )
    .all(...planIds) as TaskRow[];

  const taskIds = tasks.map((task) => task.id);
  const subtasksMap = new Map<string, SubtaskRow[]>();
  if (taskIds.length > 0) {
    const subtaskPlaceholders = taskIds.map(() => "?").join(",");
    const subtasks = db
      .prepare(
        `SELECT id, task_id, title, completed, estimated_minutes, actual_minutes, start_time, end_time FROM task_subtasks WHERE task_id IN (${subtaskPlaceholders}) ORDER BY created_at ASC`
      )
      .all(...taskIds) as Array<
      SubtaskRow & { task_id: string }
    >;
    subtasks.forEach((subtask) => {
      const list = subtasksMap.get(subtask.task_id) ?? [];
      list.push({
        id: subtask.id,
        title: subtask.title,
        completed: subtask.completed,
        estimated_minutes: subtask.estimated_minutes,
        actual_minutes: subtask.actual_minutes,
        start_time: subtask.start_time,
        end_time: subtask.end_time,
      });
      subtasksMap.set(subtask.task_id, list);
    });
  }

  const tasksMap = tasks.reduce<Record<string, Array<TaskRow & { subtasks: SubtaskRow[] }>>>(
    (acc, task) => {
    acc[task.daily_plan_id] = acc[task.daily_plan_id] || [];
    acc[task.daily_plan_id].push({
      ...task,
      subtasks: subtasksMap.get(task.id) ?? [],
    });
    return acc;
  }, {});

  const enrichedPlans = plans.map((plan) => ({
    ...plan,
    tasks: tasksMap[plan.id] ?? [],
  }));

  return NextResponse.json({ plans: enrichedPlans });
}

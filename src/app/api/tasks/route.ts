import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getActiveWorkspace, getMembershipForUser } from "@/lib/data";
import { getWorkspaceCookie } from "@/lib/auth";
import { randomUUID } from "crypto";
import {
  parseJson,
  parseSearchParams,
  categorySchema,
  dateSchema,
  notesSchema,
  prioritySchema,
  recurrenceSchema,
  timeSchema,
  titleSchema,
  uuidSchema,
} from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(
    request,
    z.object({
      dailyPlanId: uuidSchema.nullable().optional(),
      title: titleSchema,
      category: categorySchema,
      estimatedMinutes: z.number().int().min(0).max(1440).optional(),
      startTime: timeSchema.optional(),
      notes: notesSchema.nullable().optional(),
      priority: prioritySchema.optional(),
      dueDate: dateSchema.nullable().optional(),
      recurrenceRule: recurrenceSchema.nullable().optional(),
      recurrenceTime: timeSchema.nullable().optional(),
      repeatTill: dateSchema.nullable().optional(),
      position: z.number().int().min(0).optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  let planDate: { date: string } | undefined;
  let position = 0;
  let workspaceId = "";
  let userId = session.userId;
  if (body.dailyPlanId) {
    const plan = db
      .prepare("SELECT user_id, workspace_id FROM daily_plans WHERE id = ?")
      .get(body.dailyPlanId) as
      | { user_id: string; workspace_id: string }
      | undefined;

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    const membership = getMembershipForUser(session.userId, plan.workspace_id);
    if (!membership || plan.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    workspaceId = plan.workspace_id;
    const maxPosition = db
      .prepare("SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?")
      .get(body.dailyPlanId) as { position: number | null };
    const requestedPosition =
      typeof body.position === "number" && body.position >= 0
        ? body.position
        : null;
    if (requestedPosition !== null) {
      db.prepare(
        "UPDATE tasks SET position = position + 1 WHERE daily_plan_id = ? AND position >= ?"
      ).run(body.dailyPlanId, requestedPosition);
      position = requestedPosition;
    } else {
      position = (maxPosition?.position ?? 0) + 1;
    }
    planDate = db
      .prepare("SELECT date FROM daily_plans WHERE id = ?")
      .get(body.dailyPlanId) as { date: string } | undefined;
  } else {
    const active = getActiveWorkspace(
      session.userId,
      await getWorkspaceCookie()
    );
    if (!active?.workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    const membership = getMembershipForUser(session.userId, active.workspace.id);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    workspaceId = active.workspace.id;
  }

  const id = randomUUID();
  const startTimeValue = body.startTime ?? null;
  let startTimeIso: string | null = null;
  let endTimeValue: string | null = null;
  if (startTimeValue && planDate?.date && body.estimatedMinutes) {
    const startDate = new Date(`${planDate.date}T${startTimeValue}:00`);
    const endDate = new Date(
      startDate.getTime() + body.estimatedMinutes * 60 * 1000
    );
    startTimeIso = startDate.toISOString();
    endTimeValue = endDate.toISOString();
  } else if (startTimeValue && planDate?.date) {
    const startDate = new Date(`${planDate.date}T${startTimeValue}:00`);
    startTimeIso = startDate.toISOString();
  }

  const recurrenceRule = body.recurrenceRule ?? null;
  const recurrenceTime = body.recurrenceTime ?? null;
  const recurrenceStartDate = recurrenceRule && planDate?.date ? planDate.date : null;

  db.prepare(
    "INSERT INTO tasks (id, daily_plan_id, user_id, workspace_id, title, category, estimated_minutes, actual_minutes, status, notes, priority, due_date, start_time, end_time, recurrence_rule, recurrence_time, recurrence_active, recurrence_parent_id, recurrence_start_date, repeat_till, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)"
  ).run(
    id,
    body.dailyPlanId ?? null,
    userId,
    workspaceId,
    body.title.trim(),
    body.category,
    body.estimatedMinutes ?? null,
    body.dailyPlanId ? "planned" : "unplanned",
    body.notes ?? null,
    body.priority ?? "none",
    body.dueDate ?? null,
    startTimeIso,
    endTimeValue,
    recurrenceRule,
    recurrenceTime,
    recurrenceRule ? 1 : 0,
    recurrenceStartDate,
    body.repeatTill ?? null,
    position,
    now(),
    now()
  );

  logEvent({
    event: "tasks.created",
    message: "Task created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, dailyPlanId: body.dailyPlanId ?? null },
  });

  return NextResponse.json({ id });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ scope: z.literal("unplanned") })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());
  if (!active?.workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const ideas = db
    .prepare(
      `SELECT id, title, category, status, estimated_minutes, due_date, recurrence_rule, repeat_till, created_at
       FROM tasks
       WHERE daily_plan_id IS NULL
         AND status = 'unplanned'
         AND user_id = ?
         AND workspace_id = ?
       ORDER BY created_at DESC`
    )
    .all(session.userId, active.workspace.id) as Array<{
      id: string;
      title: string;
      category: string;
    status: string;
    estimated_minutes: number | null;
    recurrence_rule: string | null;
    repeat_till: string | null;
    created_at: string;
  }>;

  return NextResponse.json({ ideas });
}

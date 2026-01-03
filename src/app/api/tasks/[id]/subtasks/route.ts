import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";
import { parseJson, parseSearchParams, timeSchema, titleSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();

async function getTaskContext(
  taskId: string,
  userId: string,
  allowReadOnly = false
) {
  const task = db
    .prepare(
      `SELECT
        tasks.id,
        COALESCE(tasks.user_id, daily_plans.user_id) as user_id,
        COALESCE(tasks.workspace_id, daily_plans.workspace_id) as workspace_id,
        tasks.status as status
       FROM tasks
       LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id
       WHERE tasks.id = ?`
    )
    .get(taskId) as
    | { id: string; user_id: string; workspace_id: string; status: string }
    | undefined;
  if (!task) {
    return { error: "Task not found.", status: 404 };
  }
  const membership = getMembershipForUser(userId, task.workspace_id);
  if (!membership || task.user_id !== userId) {
    return { error: "Forbidden.", status: 403 };
  }
  if (!allowReadOnly && ["done", "cancelled", "skipped"].includes(task.status)) {
    return { error: "Completed tasks cannot be edited.", status: 409 };
  }
  return { task };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const context = await getTaskContext(id, session.userId, true);
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const subtasks = db
    .prepare(
      "SELECT id, title, completed, estimated_minutes, actual_minutes, start_time, end_time, created_at FROM task_subtasks WHERE task_id = ? ORDER BY created_at ASC"
    )
    .all(id);

  return NextResponse.json({ subtasks });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const context = await getTaskContext(id, session.userId);
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const parsed = await parseJson(
    request,
    z.object({
      title: titleSchema,
      estimatedMinutes: z.number().int().min(0).max(1440).nullable().optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const title = parsed.data.title;

  const subtaskId = randomUUID();
  db.prepare(
    "INSERT INTO task_subtasks (id, task_id, title, completed, estimated_minutes, created_at) VALUES (?, ?, ?, 0, ?, ?)"
  ).run(subtaskId, id, title, parsed.data.estimatedMinutes ?? null, now());

  logEvent({
    event: "subtasks.created",
    message: "Subtask created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, subtaskId },
  });

  return NextResponse.json({ id: subtaskId, title });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const context = await getTaskContext(id, session.userId);
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const parsed = await parseJson(
    request,
    z.object({
      subtaskId: uuidSchema,
      completed: z.boolean().optional(),
      title: titleSchema.optional(),
      estimatedMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      actualMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      startTime: timeSchema.nullable().optional(),
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const hasStartTimeUpdate = typeof body.startTime !== "undefined";
  let startTimeIso: string | null = null;
  let endTimeIso: string | null = null;
  if (typeof body.startTime === "string") {
    const planDate = db
      .prepare(
        "SELECT daily_plans.date as date FROM tasks LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id WHERE tasks.id = ?"
      )
      .get(id) as { date: string } | undefined;
    if (planDate?.date) {
      const startDate = new Date(`${planDate.date}T${body.startTime}:00`);
      startTimeIso = startDate.toISOString();
      const effectiveEstimated =
        typeof body.estimatedMinutes === "number"
          ? body.estimatedMinutes
          : null;
      if (effectiveEstimated) {
        endTimeIso = new Date(
          startDate.getTime() + effectiveEstimated * 60 * 1000
        ).toISOString();
      }
    }
  } else if (body.startTime === null) {
    startTimeIso = null;
    endTimeIso = null;
  }

  db.prepare(
    "UPDATE task_subtasks SET completed = COALESCE(?, completed), title = COALESCE(?, title), estimated_minutes = COALESCE(?, estimated_minutes), actual_minutes = COALESCE(?, actual_minutes), start_time = CASE WHEN ? = 1 THEN ? ELSE start_time END, end_time = CASE WHEN ? = 1 THEN ? ELSE end_time END WHERE id = ? AND task_id = ?"
  ).run(
    typeof body.completed === "boolean" ? Number(body.completed) : null,
    typeof body.title === "string" ? body.title.trim() : null,
    typeof body.estimatedMinutes === "number" ? body.estimatedMinutes : null,
    typeof body.actualMinutes === "number" ? body.actualMinutes : null,
    hasStartTimeUpdate ? 1 : 0,
    startTimeIso,
    hasStartTimeUpdate ? 1 : 0,
    endTimeIso,
    body.subtaskId,
    id
  );

  logEvent({
    event: "subtasks.updated",
    message: "Subtask updated.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, subtaskId: body.subtaskId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const context = await getTaskContext(id, session.userId);
  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ subtaskId: uuidSchema })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const subtaskId = parsed.data.subtaskId;

  db.prepare("DELETE FROM task_subtasks WHERE id = ? AND task_id = ?").run(
    subtaskId,
    id
  );

  logEvent({
    event: "subtasks.deleted",
    message: "Subtask deleted.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, subtaskId },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";

const now = () => new Date().toISOString();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const task = db
    .prepare(
      "SELECT tasks.id, tasks.daily_plan_id, daily_plans.user_id, daily_plans.workspace_id FROM tasks JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id WHERE tasks.id = ?"
    )
    .get(id) as
    | { id: string; daily_plan_id: string; user_id: string; workspace_id: string }
    | undefined;

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, task.workspace_id);
  if (!membership || task.user_id !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as {
    title?: string;
    category?: string;
    estimatedMinutes?: number | null;
    actualMinutes?: number | null;
    status?: "planned" | "done" | "skipped";
    notes?: string | null;
    position?: number;
    startTime?: string | null;
  };

  const planDate = db
    .prepare(
      "SELECT daily_plans.date as date, tasks.start_time as start_time FROM tasks JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id WHERE tasks.id = ?"
    )
    .get(id) as { date: string; start_time: string | null } | undefined;

  const existingStartValue =
    planDate?.start_time
      ? new Date(planDate.start_time).toISOString().slice(11, 16)
      : null;
  const startTimeValue =
    typeof body.startTime === "string" ? body.startTime : existingStartValue;
  const startTimeIso =
    typeof body.startTime === "string" && planDate?.date
      ? new Date(`${planDate.date}T${body.startTime}:00`).toISOString()
      : planDate?.start_time ?? null;
  let endTimeValue: string | null = null;
  if (startTimeValue && planDate?.date && typeof body.estimatedMinutes === "number") {
    const startDate = new Date(`${planDate.date}T${startTimeValue}:00`);
    const endDate = new Date(
      startDate.getTime() + body.estimatedMinutes * 60 * 1000
    );
    endTimeValue = endDate.toISOString();
  }

  db.prepare(
    "UPDATE tasks SET title = COALESCE(?, title), category = COALESCE(?, category), estimated_minutes = COALESCE(?, estimated_minutes), actual_minutes = COALESCE(?, actual_minutes), status = COALESCE(?, status), notes = COALESCE(?, notes), start_time = COALESCE(?, start_time), end_time = COALESCE(?, end_time), position = COALESCE(?, position), updated_at = ? WHERE id = ?"
  ).run(
    body.title?.trim() ?? null,
    body.category ?? null,
    typeof body.estimatedMinutes === "number" ? body.estimatedMinutes : null,
    typeof body.actualMinutes === "number" ? body.actualMinutes : null,
    body.status ?? null,
    typeof body.notes === "string" ? body.notes : null,
    typeof body.startTime === "string" ? startTimeIso : null,
    endTimeValue,
    typeof body.position === "number" ? body.position : null,
    now(),
    id
  );

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
  const task = db
    .prepare(
      "SELECT tasks.id, daily_plans.user_id, daily_plans.workspace_id FROM tasks JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id WHERE tasks.id = ?"
    )
    .get(id) as { id: string; user_id: string; workspace_id: string } | undefined;

  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, task.workspace_id);
  if (!membership || task.user_id !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);

  return NextResponse.json({ ok: true });
}

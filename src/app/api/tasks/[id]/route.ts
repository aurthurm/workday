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
      `SELECT
        tasks.id,
        tasks.daily_plan_id,
        COALESCE(tasks.user_id, daily_plans.user_id) as user_id,
        COALESCE(tasks.workspace_id, daily_plans.workspace_id) as workspace_id
       FROM tasks
       LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id
       WHERE tasks.id = ?`
    )
    .get(id) as
    | { id: string; daily_plan_id: string | null; user_id: string; workspace_id: string }
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
    status?: "planned" | "done" | "skipped" | "cancelled" | "unplanned";
    notes?: string | null;
    position?: number;
    startTime?: string | null;
    dailyPlanId?: string;
    priority?: "high" | "medium" | "low" | "none";
    dueDate?: string | null;
    repeatTill?: string | null;
    recurrenceRule?: string | null;
    recurrenceTime?: string | null;
    recurrenceAction?: "stop" | "delete_all";
  };

  let targetPlanId: string | null = null;
  let targetPlanUserId: string | null = null;
  let targetPlanWorkspaceId: string | null = null;
  if (body.dailyPlanId) {
    const targetPlan = db
      .prepare(
        "SELECT id, user_id, workspace_id FROM daily_plans WHERE id = ?"
      )
      .get(body.dailyPlanId) as
      | { id: string; user_id: string; workspace_id: string }
      | undefined;

    if (!targetPlan || targetPlan.user_id !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    targetPlanId = targetPlan.id;
    targetPlanUserId = targetPlan.user_id;
    targetPlanWorkspaceId = targetPlan.workspace_id;
  }

  if (targetPlanId) {
    const maxPosition = db
      .prepare(
        "SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?"
      )
      .get(targetPlanId) as { position: number | null };
    const positionValue = (maxPosition?.position ?? 0) + 1;
    db.prepare(
      "UPDATE tasks SET daily_plan_id = ?, user_id = ?, workspace_id = ?, position = ?, status = 'planned', start_time = NULL, end_time = NULL, updated_at = ? WHERE id = ?"
    ).run(
      targetPlanId,
      targetPlanUserId,
      targetPlanWorkspaceId,
      positionValue,
      now(),
      id
    );
    return NextResponse.json({ ok: true });
  }

  const taskRecurrence = db
    .prepare(
      "SELECT recurrence_parent_id, recurrence_rule, recurrence_active, recurrence_start_date FROM tasks WHERE id = ?"
    )
    .get(id) as
    | {
        recurrence_parent_id: string | null;
        recurrence_rule: string | null;
        recurrence_active: number | null;
        recurrence_start_date: string | null;
      }
    | undefined;

  const planDate = db
    .prepare(
      "SELECT daily_plans.date as date, tasks.start_time as start_time, tasks.estimated_minutes as estimated_minutes FROM tasks LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id WHERE tasks.id = ?"
    )
    .get(id) as
    | { date: string; start_time: string | null; estimated_minutes: number | null }
    | undefined;

  if (body.recurrenceAction) {
    const templateId = taskRecurrence?.recurrence_parent_id ?? id;
    if (body.recurrenceAction === "stop") {
      const cancelDate =
        planDate?.date ?? new Date().toISOString().slice(0, 10);
      db.prepare(
        "UPDATE tasks SET recurrence_active = 0, repeat_till = ? WHERE id = ?"
      ).run(cancelDate, templateId);
      return NextResponse.json({ ok: true });
    }
    if (body.recurrenceAction === "delete_all") {
      db.prepare(
        "DELETE FROM tasks WHERE id = ? OR recurrence_parent_id = ?"
      ).run(templateId, templateId);
      return NextResponse.json({ ok: true });
    }
  }

  const templateId = taskRecurrence?.recurrence_parent_id ?? id;
  if (typeof body.repeatTill === "string") {
    db.prepare(
      "UPDATE tasks SET repeat_till = ?, recurrence_active = 1 WHERE id = ?"
    ).run(body.repeatTill, templateId);
    db.prepare(
      `DELETE FROM tasks
       WHERE recurrence_parent_id = ?
         AND daily_plan_id IN (
           SELECT id FROM daily_plans WHERE date > ?
         )`
    ).run(templateId, body.repeatTill);
    db.prepare(
      "UPDATE tasks SET repeat_till = ? WHERE recurrence_parent_id = ?"
    ).run(body.repeatTill, templateId);
    return NextResponse.json({ ok: true });
  }
  if (
    typeof body.recurrenceRule !== "undefined" &&
    (body.recurrenceRule === null || body.recurrenceRule === "none")
  ) {
    db.prepare(
      "UPDATE tasks SET recurrence_rule = NULL, recurrence_time = NULL, recurrence_active = 0, repeat_till = NULL WHERE id = ?"
    ).run(templateId);
    db.prepare(
      "UPDATE tasks SET recurrence_rule = NULL, recurrence_time = NULL, recurrence_active = 0, repeat_till = NULL WHERE recurrence_parent_id = ?"
    ).run(templateId);
    return NextResponse.json({ ok: true });
  }

  const existingStartValue = planDate?.start_time
    ? new Date(planDate.start_time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  const hasStartTimeUpdate = typeof body.startTime !== "undefined";
  const startTimeValue =
    typeof body.startTime === "string" ? body.startTime : existingStartValue;
  const startTimeIso =
    typeof body.startTime === "string" && planDate?.date
      ? new Date(`${planDate.date}T${body.startTime}:00`).toISOString()
      : body.startTime === null
      ? null
      : planDate?.start_time ?? null;
  let endTimeValue: string | null = null;
  const shouldRecalculateEnd =
    typeof body.startTime === "string" ||
    typeof body.estimatedMinutes === "number";
  if (shouldRecalculateEnd) {
    const effectiveEstimated =
      typeof body.estimatedMinutes === "number"
        ? body.estimatedMinutes
        : planDate?.estimated_minutes ?? null;
    if (
      startTimeValue &&
      planDate?.date &&
      typeof effectiveEstimated === "number"
    ) {
      const startDate = new Date(`${planDate.date}T${startTimeValue}:00`);
      const endDate = new Date(
        startDate.getTime() + effectiveEstimated * 60 * 1000
      );
      endTimeValue = endDate.toISOString();
    }
  } else if (body.startTime === null) {
    endTimeValue = null;
  }

  const hasRecurrenceUpdate =
    typeof body.recurrenceRule !== "undefined" ||
    typeof body.recurrenceTime !== "undefined";
  const hasDueDateUpdate = typeof body.dueDate !== "undefined";
  const dueDateValue = typeof body.dueDate === "string" ? body.dueDate : null;
  const hasRepeatTillUpdate = typeof body.repeatTill !== "undefined";
  const repeatTillValue =
    typeof body.repeatTill === "string" ? body.repeatTill : null;
  const recurrenceRuleValue =
    typeof body.recurrenceRule === "string"
      ? body.recurrenceRule.trim() || null
      : null;
  const recurrenceTimeValue =
    typeof body.recurrenceTime === "string" ? body.recurrenceTime.trim() : null;
  const recurrenceActiveValue =
    typeof body.recurrenceRule !== "undefined"
      ? recurrenceRuleValue && recurrenceRuleValue !== "none"
        ? 1
        : 0
      : null;
  const nextRecurrenceStartDate =
    typeof body.recurrenceRule !== "undefined"
      ? recurrenceRuleValue && recurrenceRuleValue !== "none"
        ? taskRecurrence?.recurrence_start_date ?? planDate?.date ?? null
        : null
      : null;

  db.prepare(
    "UPDATE tasks SET title = COALESCE(?, title), category = COALESCE(?, category), estimated_minutes = COALESCE(?, estimated_minutes), actual_minutes = COALESCE(?, actual_minutes), status = COALESCE(?, status), notes = COALESCE(?, notes), priority = COALESCE(?, priority), due_date = CASE WHEN ? = 1 THEN ? ELSE due_date END, repeat_till = CASE WHEN ? = 1 THEN ? ELSE repeat_till END, start_time = CASE WHEN ? = 1 THEN ? ELSE start_time END, end_time = CASE WHEN ? = 1 THEN ? ELSE end_time END, position = COALESCE(?, position), recurrence_rule = COALESCE(?, recurrence_rule), recurrence_time = COALESCE(?, recurrence_time), recurrence_active = COALESCE(?, recurrence_active), recurrence_start_date = COALESCE(?, recurrence_start_date), updated_at = ? WHERE id = ?"
  ).run(
    body.title?.trim() ?? null,
    body.category ?? null,
    typeof body.estimatedMinutes === "number" ? body.estimatedMinutes : null,
    typeof body.actualMinutes === "number" ? body.actualMinutes : null,
    body.status ?? null,
    typeof body.notes === "string" ? body.notes : null,
    body.priority ?? null,
    hasDueDateUpdate ? 1 : 0,
    dueDateValue,
    hasRepeatTillUpdate ? 1 : 0,
    repeatTillValue,
    hasStartTimeUpdate ? 1 : 0,
    startTimeIso,
    hasStartTimeUpdate ? 1 : 0,
    endTimeValue,
    typeof body.position === "number" ? body.position : null,
    hasRecurrenceUpdate ? recurrenceRuleValue : null,
    typeof body.recurrenceTime !== "undefined" ? recurrenceTimeValue : null,
    recurrenceActiveValue,
    nextRecurrenceStartDate,
    now(),
    id
  );

  if (
    taskRecurrence?.recurrence_parent_id ||
    (hasRecurrenceUpdate && templateId === id)
  ) {
    db.prepare(
    "UPDATE tasks SET recurrence_rule = COALESCE(?, recurrence_rule), recurrence_time = COALESCE(?, recurrence_time), recurrence_active = COALESCE(?, recurrence_active), repeat_till = CASE WHEN ? = 1 THEN ? ELSE repeat_till END WHERE recurrence_parent_id = ?"
    ).run(
      hasRecurrenceUpdate ? recurrenceRuleValue : null,
      typeof body.recurrenceTime !== "undefined" ? recurrenceTimeValue : null,
      recurrenceActiveValue,
      hasRepeatTillUpdate ? 1 : 0,
      repeatTillValue,
      templateId
    );
  }

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
      `SELECT
        tasks.id,
        COALESCE(tasks.user_id, daily_plans.user_id) as user_id,
        COALESCE(tasks.workspace_id, daily_plans.workspace_id) as workspace_id
       FROM tasks
       LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id
       WHERE tasks.id = ?`
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

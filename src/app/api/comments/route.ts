import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";
import { randomUUID } from "crypto";
import { parseJson, textSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(
    request,
    z
      .object({
        dailyPlanId: uuidSchema.optional(),
        taskId: uuidSchema.optional(),
        content: textSchema,
      })
      .refine((data) => data.dailyPlanId || data.taskId, {
        message: "Plan or task is required.",
      })
  );
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: 400 }
    );
  }

  let planId = parsed.data.dailyPlanId ?? null;
  if (parsed.data.taskId) {
    const task = db
      .prepare(
        "SELECT tasks.daily_plan_id as daily_plan_id FROM tasks WHERE id = ?"
      )
      .get(parsed.data.taskId) as { daily_plan_id: string } | undefined;
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }
    if (planId && planId !== task.daily_plan_id) {
      return NextResponse.json(
        { error: "Task does not belong to plan." },
        { status: 400 }
      );
    }
    planId = task.daily_plan_id;
  }

  if (!planId) {
    return NextResponse.json({ error: "Plan is required." }, { status: 400 });
  }

  const plan = db
    .prepare("SELECT workspace_id FROM daily_plans WHERE id = ?")
    .get(planId) as { workspace_id: string } | undefined;

  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, plan.workspace_id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO comments (id, daily_plan_id, task_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    planId,
    parsed.data.taskId ?? null,
    session.userId,
    parsed.data.content.trim(),
    new Date().toISOString()
  );

  logEvent({
    event: "comments.created",
    message: "Comment created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { planId, taskId: parsed.data.taskId ?? null },
  });

  return NextResponse.json({ id });
}

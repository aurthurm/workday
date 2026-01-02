import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";
import { randomUUID } from "crypto";

const now = () => new Date().toISOString();

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    dailyPlanId?: string;
    title?: string;
    category?: string;
    estimatedMinutes?: number;
    startTime?: string;
  };

  if (!body.dailyPlanId || !body.title || !body.category) {
    return NextResponse.json(
      { error: "Missing required fields." },
      { status: 400 }
    );
  }

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

  const maxPosition = db
    .prepare("SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?")
    .get(body.dailyPlanId) as { position: number | null };

  const position = (maxPosition?.position ?? 0) + 1;
  const id = randomUUID();
  const planDate = db
    .prepare("SELECT date FROM daily_plans WHERE id = ?")
    .get(body.dailyPlanId) as { date: string } | undefined;
  const startTimeValue = body.startTime?.trim() || null;
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

  db.prepare(
    "INSERT INTO tasks (id, daily_plan_id, title, category, estimated_minutes, actual_minutes, status, notes, start_time, end_time, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?)"
  ).run(
    id,
    body.dailyPlanId,
    body.title.trim(),
    body.category,
    body.estimatedMinutes ?? null,
    "planned",
    startTimeIso,
    endTimeValue,
    position,
    now(),
    now()
  );

  return NextResponse.json({ id });
}

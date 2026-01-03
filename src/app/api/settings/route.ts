import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

const now = () => new Date().toISOString();

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const existing = db
    .prepare(
      "SELECT appearance, task_add_position, default_est_minutes, due_soon_days, ai_confirm, ai_routine, ai_work_hours, ai_preferences FROM user_settings WHERE user_id = ?"
    )
    .get(session.userId) as
    | {
        appearance: string;
        task_add_position: string;
        default_est_minutes: number;
        due_soon_days: number;
        ai_confirm: number;
        ai_routine: string | null;
        ai_work_hours: string | null;
        ai_preferences: string | null;
      }
    | undefined;

  if (!existing) {
    db.prepare(
      "INSERT INTO user_settings (user_id, created_at, updated_at) VALUES (?, ?, ?)"
    ).run(session.userId, now(), now());
  }

  const settings = existing ?? {
    appearance: "light",
    task_add_position: "bottom",
    default_est_minutes: 15,
    due_soon_days: 3,
    ai_confirm: 1,
    ai_routine: null,
    ai_work_hours: null,
    ai_preferences: null,
  };

  return NextResponse.json({ settings });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    appearance?: "light" | "dark";
    taskAddPosition?: "top" | "bottom";
    defaultEstMinutes?: number;
    dueSoonDays?: number;
    aiConfirm?: boolean;
    aiRoutine?: string | null;
    aiWorkHours?: string | null;
    aiPreferences?: string | null;
  };

  db.prepare(
    `INSERT INTO user_settings (
      user_id,
      appearance,
      task_add_position,
      default_est_minutes,
      due_soon_days,
      ai_confirm,
      ai_routine,
      ai_work_hours,
      ai_preferences,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      appearance = COALESCE(?, appearance),
      task_add_position = COALESCE(?, task_add_position),
      default_est_minutes = COALESCE(?, default_est_minutes),
      due_soon_days = COALESCE(?, due_soon_days),
      ai_confirm = COALESCE(?, ai_confirm),
      ai_routine = COALESCE(?, ai_routine),
      ai_work_hours = COALESCE(?, ai_work_hours),
      ai_preferences = COALESCE(?, ai_preferences),
      updated_at = ?`
  ).run(
    session.userId,
    body.appearance ?? "light",
    body.taskAddPosition ?? "bottom",
    typeof body.defaultEstMinutes === "number" ? body.defaultEstMinutes : 15,
    typeof body.dueSoonDays === "number" ? body.dueSoonDays : 3,
    typeof body.aiConfirm === "boolean" ? Number(body.aiConfirm) : 1,
    body.aiRoutine ?? null,
    body.aiWorkHours ?? null,
    body.aiPreferences ?? null,
    now(),
    now(),
    body.appearance ?? null,
    body.taskAddPosition ?? null,
    typeof body.defaultEstMinutes === "number" ? body.defaultEstMinutes : null,
    typeof body.dueSoonDays === "number" ? body.dueSoonDays : null,
    typeof body.aiConfirm === "boolean" ? Number(body.aiConfirm) : null,
    body.aiRoutine ?? null,
    body.aiWorkHours ?? null,
    body.aiPreferences ?? null,
    now()
  );

  return NextResponse.json({ ok: true });
}

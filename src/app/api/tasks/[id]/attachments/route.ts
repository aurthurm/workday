import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";
import { parseJson, parseSearchParams, urlSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();

export async function GET(
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
        COALESCE(tasks.workspace_id, daily_plans.workspace_id) as workspace_id,
        tasks.status as status
       FROM tasks
       LEFT JOIN daily_plans ON daily_plans.id = tasks.daily_plan_id
       WHERE tasks.id = ?`
    )
    .get(id) as
    | { id: string; user_id: string; workspace_id: string; status: string }
    | undefined;
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const membership = getMembershipForUser(session.userId, task.workspace_id);
  if (!membership || task.user_id !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const attachments = db
    .prepare(
      "SELECT id, url, created_at FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC"
    )
    .all(id);

  return NextResponse.json({ attachments });
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
    .get(id) as
    | { id: string; user_id: string; workspace_id: string; status: string }
    | undefined;
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const membership = getMembershipForUser(session.userId, task.workspace_id);
  if (!membership || task.user_id !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (["done", "cancelled", "skipped"].includes(task.status)) {
    return NextResponse.json(
      { error: "Completed tasks cannot be edited." },
      { status: 409 }
    );
  }

  const parsed = await parseJson(
    request,
    z.object({
      url: urlSchema,
    })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const url = parsed.data.url;

  const attachmentId = randomUUID();
  db.prepare(
    "INSERT INTO task_attachments (id, task_id, url, created_at) VALUES (?, ?, ?, ?)"
  ).run(attachmentId, id, url, now());

  logEvent({
    event: "attachments.created",
    message: "Attachment created.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, attachmentId },
  });

  return NextResponse.json({ id: attachmentId, url });
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

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ attachmentId: uuidSchema })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const attachmentId = parsed.data.attachmentId;

  db.prepare("DELETE FROM task_attachments WHERE id = ? AND task_id = ?").run(
    attachmentId,
    id
  );

  logEvent({
    event: "attachments.deleted",
    message: "Attachment deleted.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, attachmentId },
  });

  return NextResponse.json({ ok: true });
}

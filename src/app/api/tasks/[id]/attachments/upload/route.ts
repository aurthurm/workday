import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getMembershipForUser } from "@/lib/data";
import { getClientIp, logEvent } from "@/lib/logger";

const now = () => new Date().toISOString();
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large." },
      { status: 400 }
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const extension = path.extname(file.name || "");
  const filename = `${randomUUID()}${extension}`;
  const filePath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const url = `/uploads/${filename}`;
  const attachmentId = randomUUID();
  db.prepare(
    "INSERT INTO task_attachments (id, task_id, url, created_at) VALUES (?, ?, ?, ?)"
  ).run(attachmentId, id, url, now());

  logEvent({
    event: "attachments.uploaded",
    message: "Attachment uploaded.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { taskId: id, attachmentId },
  });

  return NextResponse.json({ id: attachmentId, url });
}

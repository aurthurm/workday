import { db } from "@/lib/db";
import { upsertDailyPlan } from "@/lib/data";

const now = () => new Date().toISOString();

export function rolloverIncompleteTasks(params: {
  userId: string;
  workspaceId: string;
  fromDate: string;
  toDate: string;
}) {
  const sourcePlan = db
    .prepare(
      "SELECT id, visibility FROM daily_plans WHERE user_id = ? AND workspace_id = ? AND date = ?"
    )
    .get(params.userId, params.workspaceId, params.fromDate) as
    | { id: string; visibility: "team" | "private" }
    | undefined;

  if (!sourcePlan) return;

  const tasks = db
    .prepare(
      "SELECT id FROM tasks WHERE daily_plan_id = ? AND status = 'planned'"
    )
    .all(sourcePlan.id) as Array<{ id: string }>;

  if (tasks.length === 0) return;

  const targetPlanId = upsertDailyPlan({
    userId: params.userId,
    workspaceId: params.workspaceId,
    date: params.toDate,
    visibility: sourcePlan.visibility,
  });

  const maxPosition = db
    .prepare("SELECT MAX(position) as position FROM tasks WHERE daily_plan_id = ?")
    .get(targetPlanId) as { position: number | null };

  let position = (maxPosition?.position ?? 0) + 1;
  const updateTask = db.prepare(
    "UPDATE tasks SET daily_plan_id = ?, position = ?, start_time = NULL, end_time = NULL, updated_at = ? WHERE id = ?"
  );

  tasks.forEach((task) => {
    updateTask.run(targetPlanId, position, now(), task.id);
    position += 1;
  });
}

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
  const plan = db
    .prepare(
      "SELECT id, user_id, workspace_id FROM daily_plans WHERE id = ?"
    )
    .get(id) as { id: string; user_id: string; workspace_id: string } | undefined;

  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const membership = getMembershipForUser(session.userId, plan.workspace_id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = (await request.json()) as {
    visibility?: "team" | "private";
    submitted?: boolean;
    reviewed?: boolean;
    reflection?: {
      what_went_well?: string;
      blockers?: string;
      tomorrow_focus?: string;
    };
  };

  const isOwner = plan.user_id === session.userId;
  const canReview = membership.role === "supervisor" || membership.role === "admin";

  if (!isOwner && !canReview) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (isOwner) {
    if (body.visibility || typeof body.submitted === "boolean") {
      db.prepare(
        "UPDATE daily_plans SET visibility = COALESCE(?, visibility), submitted = COALESCE(?, submitted), updated_at = ? WHERE id = ?"
      ).run(
        body.visibility ?? null,
        typeof body.submitted === "boolean" ? Number(body.submitted) : null,
        now(),
        plan.id
      );
    }

    if (body.reflection) {
      const existing = db
        .prepare("SELECT id FROM reflections WHERE daily_plan_id = ?")
        .get(plan.id) as { id: string } | undefined;

      if (existing) {
        db.prepare(
          "UPDATE reflections SET what_went_well = ?, blockers = ?, tomorrow_focus = ?, updated_at = ? WHERE daily_plan_id = ?"
        ).run(
          body.reflection.what_went_well ?? "",
          body.reflection.blockers ?? "",
          body.reflection.tomorrow_focus ?? "",
          now(),
          plan.id
        );
      } else {
        db.prepare(
          "INSERT INTO reflections (id, daily_plan_id, what_went_well, blockers, tomorrow_focus, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(
          randomUUID(),
          plan.id,
          body.reflection.what_went_well ?? "",
          body.reflection.blockers ?? "",
          body.reflection.tomorrow_focus ?? "",
          now()
        );
      }
    }
  }

  if (typeof body.reviewed === "boolean" && canReview) {
    db.prepare(
      "UPDATE daily_plans SET reviewed = ?, updated_at = ? WHERE id = ?"
    ).run(Number(body.reviewed), now(), plan.id);
  }

  return NextResponse.json({ ok: true });
}

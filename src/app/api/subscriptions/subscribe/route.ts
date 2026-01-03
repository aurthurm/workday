import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { setUserPlan } from "@/lib/data";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const planKeySchema = z.enum(["free", "pro", "enterprise"]);

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsed = await parseJson(request, z.object({ planKey: planKeySchema }));
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const planKey = parsed.data.planKey;

  const plan = db
    .prepare("SELECT key FROM subscription_plans WHERE key = ?")
    .get(planKey) as { key: string } | undefined;
  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  setUserPlan(session.userId, planKey);

  logEvent({
    event: "subscriptions.updated",
    message: "Subscription updated.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { planKey },
  });

  return NextResponse.json({ ok: true, planKey });
}

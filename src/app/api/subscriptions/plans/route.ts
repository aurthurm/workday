import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getUserIsAdmin } from "@/lib/data";
import { parseJson } from "@/lib/validation";
import { z } from "zod";
import { getClientIp, logEvent } from "@/lib/logger";

const planKeys = ["free", "pro", "enterprise"] as const;

const planUpdateSchema = z.object({
  key: z.enum(planKeys),
  name: z.string().trim().min(1).max(80),
  priceMonthly: z.number().int().min(0),
  features: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number().int().min(0)),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!getUserIsAdmin(session.userId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const plans = db
    .prepare(
      "SELECT key, name, price_monthly, features_json, limits_json FROM subscription_plans ORDER BY price_monthly ASC"
    )
    .all() as Array<{
    key: string;
    name: string;
    price_monthly: number;
    features_json: string;
    limits_json: string;
  }>;

  return NextResponse.json({
    plans: plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      price_monthly: plan.price_monthly ?? 0,
      features: JSON.parse(plan.features_json ?? "{}"),
      limits: JSON.parse(plan.limits_json ?? "{}"),
    })),
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!getUserIsAdmin(session.userId)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseJson(request, planUpdateSchema);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const body = parsed.data;

  const existing = db
    .prepare("SELECT key FROM subscription_plans WHERE key = ?")
    .get(body.key) as { key: string } | undefined;
  if (!existing) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  db.prepare(
    "UPDATE subscription_plans SET name = ?, price_monthly = ?, features_json = ?, limits_json = ?, updated_at = ? WHERE key = ?"
  ).run(
    body.name,
    body.priceMonthly,
    JSON.stringify(body.features),
    JSON.stringify(body.limits),
    new Date().toISOString(),
    body.key
  );

  logEvent({
    event: "subscription_plans.updated",
    message: "Subscription plan updated.",
    userId: session.userId,
    ip: getClientIp(request),
    meta: { planKey: body.key },
  });

  return NextResponse.json({ ok: true });
}

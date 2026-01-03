import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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

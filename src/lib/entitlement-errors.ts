import { NextResponse } from "next/server";

export function featureNotAvailable(feature: string) {
  return NextResponse.json(
    {
      error: "Feature not available on your plan.",
      code: "FEATURE_NOT_AVAILABLE",
      feature,
      upgrade_required: true,
    },
    { status: 403 }
  );
}

export function limitReached(limit: string, max: number) {
  return NextResponse.json(
    {
      error: "Plan limit reached.",
      code: "LIMIT_REACHED",
      limit,
      max,
      upgrade_required: true,
    },
    { status: 403 }
  );
}

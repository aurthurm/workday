import { db } from "@/lib/db";
import { getUserIsAdmin, getUserPlanKey } from "@/lib/data";

export type EntitlementFeatures = Record<string, boolean>;
export type EntitlementLimits = Record<string, number>;

export type Entitlements = {
  planKey: string;
  planName: string;
  features: EntitlementFeatures;
  limits: EntitlementLimits;
  isAdmin: boolean;
};

const adminFeatures: EntitlementFeatures = {
  "feature.ai_assistant": true,
  "feature.due_dates": true,
  "feature.view_timeline": true,
  "feature.view_kanban": true,
  "feature.future_plans": true,
  "feature.integrations": true,
};

const adminLimits: EntitlementLimits = {
  "limit.personal_workspaces": 999,
  "limit.organizations": 999,
  "limit.org_workspaces_per_org": 999,
  "limit.categories_per_workspace": 999,
  "limit.org_members": 999,
};

export function getPlanConfig(planKey: string) {
  const row = db
    .prepare(
      "SELECT key, name, features_json, limits_json FROM subscription_plans WHERE key = ?"
    )
    .get(planKey) as
    | {
        key: string;
        name: string;
        features_json: string;
        limits_json: string;
      }
    | undefined;
  if (!row) {
    return {
      key: "free",
      name: "Free",
      features: { ...adminFeatures, "feature.ai_assistant": false, "feature.due_dates": false, "feature.view_timeline": false, "feature.view_kanban": false, "feature.future_plans": false, "feature.integrations": false },
      limits: { ...adminLimits, "limit.personal_workspaces": 1, "limit.organizations": 1, "limit.org_workspaces_per_org": 1, "limit.categories_per_workspace": 5, "limit.org_members": 3 },
    };
  }
  return {
    key: row.key,
    name: row.name,
    features: JSON.parse(row.features_json) as EntitlementFeatures,
    limits: JSON.parse(row.limits_json) as EntitlementLimits,
  };
}

export function getEntitlements(userId: string): Entitlements {
  const isAdmin = getUserIsAdmin(userId);
  if (isAdmin) {
    return {
      planKey: "admin",
      planName: "Admin",
      features: adminFeatures,
      limits: adminLimits,
      isAdmin: true,
    };
  }
  const planKey = getUserPlanKey(userId);
  const config = getPlanConfig(planKey);
  return {
    planKey: config.key,
    planName: config.name,
    features: config.features,
    limits: config.limits,
    isAdmin: false,
  };
}

export function featureAllowed(entitlements: Entitlements, key: string) {
  return Boolean(entitlements.features[key]);
}

export function limitValue(entitlements: Entitlements, key: string) {
  return entitlements.limits[key] ?? 0;
}

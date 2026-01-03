import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type EntitlementsResponse = {
  entitlements: {
    planKey: string;
    planName: string;
    features: Record<string, boolean>;
    limits: Record<string, number>;
    isAdmin: boolean;
  };
  usage: Record<string, number>;
  workspace: { id: string; type: "personal" | "organization"; org_id: string | null };
};

export function useEntitlements(enabled = true) {
  return useQuery({
    queryKey: ["entitlements"],
    queryFn: () => apiFetch<EntitlementsResponse>("/api/entitlements"),
    enabled,
  });
}

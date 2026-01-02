"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ProfileResponse = {
  user: { id: string; name: string; email: string };
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceType: string;
    role: string;
  }>;
};

export default function ProfilePage() {
  const { data } = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch<ProfileResponse>("/api/profile"),
  });

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-display text-ink-900">My Profile</h3>
        <p className="text-sm text-ink-600">
          Your account details and workspace roles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-700">
          <p>
            <span className="font-medium text-ink-900">Name:</span> {data.user.name}
          </p>
          <p>
            <span className="font-medium text-ink-900">Email:</span> {data.user.email}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.memberships.map((membership) => (
            <div
              key={membership.workspaceId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200/70 bg-ink-50/60 p-3 text-sm"
            >
              <div>
                <p className="font-medium text-ink-900">
                  {membership.workspaceName}
                </p>
                <p className="text-ink-600">{membership.workspaceType}</p>
              </div>
              <Badge variant="outline">{membership.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

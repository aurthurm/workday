"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type WorkspaceResponse = {
  workspaces: Array<{
    id: string;
    name: string;
    type: "personal" | "organization";
    role: "member" | "supervisor" | "admin";
  }>;
  activeWorkspaceId: string | null;
};

export function WorkspaceSwitcher() {
  const { data, refetch } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspaceResponse>("/api/workspaces"),
  });

  const switchMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      apiFetch("/api/workspaces/switch", {
        method: "POST",
        body: { workspaceId },
      }),
    onSuccess: () => refetch(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/api/workspaces", {
        method: "POST",
        body: { name: "New Workspace", type: "organization" },
      }),
    onSuccess: () => refetch(),
  });

  const activeId = data?.activeWorkspaceId ?? "";
  const activeRole =
    data?.workspaces.find((workspace) => workspace.id === activeId)?.role ??
    "member";
  const canCreate = activeRole === "admin";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink-200/70 bg-white/80 p-4 shadow-inset">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
          Workspace
        </p>
        <p className="text-sm text-ink-700">Switch context</p>
      </div>
      <Select
        value={activeId || undefined}
        onValueChange={(value) => switchMutation.mutate(value)}
      >
        <SelectTrigger className="w-full bg-white">
          <SelectValue placeholder="Choose workspace" />
        </SelectTrigger>
        <SelectContent>
          {data?.workspaces.map((workspace) => (
            <SelectItem key={workspace.id} value={workspace.id}>
              {workspace.name} · {workspace.role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        className="h-9 text-xs"
        onClick={() => createMutation.mutate()}
        disabled={!canCreate || createMutation.isPending}
      >
        {createMutation.isPending ? "Creating..." : "New workspace"}
      </Button>
    </div>
  );
}

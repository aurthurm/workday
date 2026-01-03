"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WorkspaceResponse = {
  workspaces: Array<{
    id: string;
    name: string;
    type: "personal" | "organization";
    role: "member" | "supervisor" | "admin";
    org_id?: string | null;
    is_default?: number;
  }>;
  activeWorkspaceId: string | null;
};

export function WorkspaceSwitcher() {
  const { data, refetch } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspaceResponse>("/api/workspaces"),
  });
  const queryClient = useQueryClient();

  const switchMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      apiFetch("/api/workspaces/switch", {
        method: "POST",
        body: { workspaceId },
      }),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
    },
  });

  const activeId = data?.activeWorkspaceId ?? "";
  return (
    <div className="flex flex-col gap-3">
      <hr />
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Workspace Switcher
        </p>
      </div>
      <Select
        value={activeId || undefined}
        onValueChange={(value) => switchMutation.mutate(value)}
      >
      <SelectTrigger className="w-full bg-background">
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
      <hr />
    </div>
  );
}

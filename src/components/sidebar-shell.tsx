"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { SidebarNav, UserMenu } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarShellProps = {
  name: string;
  workspaceName: string;
  role: string;
};

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

export function SidebarShell({ name, workspaceName, role }: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const queryClient = useQueryClient();

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
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["plan"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      setWorkspaceSwitcherOpen(false);
      window.location.reload();
    },
  });

  const activeId = data?.activeWorkspaceId ?? "";

  return (
    <aside
      className={cn(
        "hidden h-full flex-col border-r border-border/70 bg-card/80 transition-all duration-200 ease-in-out lg:flex",
        collapsed ? "w-20" : "w-60"
      )}
    >
      <div className="flex h-full flex-col gap-6 p-6">
        <div className="flex h-14 items-center justify-between border-b border-border/70 pb-4">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setCollapsed((prev) => !prev)}
            className="h-9 w-9 rounded-xl border border-border/70 bg-card/60 shadow-sm"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          {!collapsed && (
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workday
            </div>
          )}
        </div>

        <div className={cn("relative flex items-center", collapsed ? "justify-center" : "justify-start")}>
          {!collapsed && (
            <button
              onClick={() => setWorkspaceSwitcherOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted/60 transition"
              aria-label="Switch workspace"
            >
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-display font-semibold text-foreground truncate">
                  {workspaceName}
                </h1>
                <p className="text-xs text-muted-foreground capitalize">{role}</p>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => setWorkspaceSwitcherOpen((prev) => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-muted/60 text-sm font-semibold text-foreground hover:bg-muted transition"
              aria-label="Switch workspace"
            >
              {workspaceName.slice(0, 1).toUpperCase()}
            </button>
          )}

          {/* Workspace Switcher Panel */}
          {workspaceSwitcherOpen && (
            <div
              className={cn(
                "absolute z-50 min-w-[240px] rounded-xl border border-border/70 bg-card p-2 shadow-card",
                collapsed ? "left-full top-0 ml-3" : "left-0 top-full mt-2"
              )}
            >
              <div className="mb-2 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Switch Workspace
                </p>
              </div>
              <div className="max-h-[300px] overflow-auto">
                {data?.workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => switchMutation.mutate(workspace.id)}
                    disabled={switchMutation.isPending}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                      workspace.id === activeId
                        ? "bg-tide-100 text-tide-800"
                        : "text-foreground hover:bg-muted/60"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{workspace.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {workspace.role} · {workspace.type}
                      </div>
                    </div>
                    {workspace.id === activeId && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <SidebarNav collapsed={collapsed} />

        <div className="mt-auto border-t border-border/70 pt-4">
          <UserMenu name={name} collapsed={collapsed} />
        </div>
      </div>

      {/* Overlay to close workspace switcher */}
      {workspaceSwitcherOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setWorkspaceSwitcherOpen(false)}
        />
      )}
    </aside>
  );
}

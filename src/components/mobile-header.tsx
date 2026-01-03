"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Settings,
  LogOut,
  UserCircle,
  HelpCircle,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { SidebarNav } from "@/components/nav";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsModal } from "@/components/settings-modal";

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

export function MobileHeader({
  name,
  workspaceName,
  role,
}: {
  name: string;
  workspaceName: string;
  role: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isWorkspaceSwitcherOpen, setIsWorkspaceSwitcherOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    | "profile"
    | "subscription"
    | "general"
    | "invitations"
    | "workspaces"
    | "organizations"
    | "categories"
    | "integrations"
    | "ai"
    | "due_dates"
  >("profile");

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
      setIsWorkspaceSwitcherOpen(false);
      setIsMenuOpen(false);
      window.location.reload();
    },
  });

  const activeId = data?.activeWorkspaceId ?? "";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/70 bg-card/95 px-4 backdrop-blur-sm lg:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-display font-semibold text-foreground">
              {workspaceName}
            </h1>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workday
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60] bg-ink-900/40 backdrop-blur-sm lg:hidden"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Menu Panel */}
          <aside
            className="fixed left-0 top-14 bottom-0 z-[70] w-[280px] overflow-auto border-r border-border/70 bg-card lg:hidden"
            role="dialog"
            aria-label="Mobile menu"
          >
            <div className="flex flex-col gap-6 p-6">
              {/* Workspace Switcher */}
              <div className="space-y-3">
                <button
                  onClick={() => setIsWorkspaceSwitcherOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-muted/60 transition"
                  aria-label="Switch workspace"
                  aria-expanded={isWorkspaceSwitcherOpen}
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-display font-semibold text-foreground truncate">
                      {workspaceName}
                    </h2>
                    <p className="text-xs text-muted-foreground capitalize">{role}</p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>

                {isWorkspaceSwitcherOpen && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-2">
                    <p className="mb-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Switch Workspace
                    </p>
                    <div className="max-h-[240px] overflow-auto space-y-1">
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

              {/* Navigation */}
              <div>
                <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Navigation
                </p>
                <SidebarNav collapsed={false} />
              </div>

              {/* User Menu */}
              <div className="mt-auto space-y-2 border-t border-border/70 pt-4">
                <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Account
                </p>
                <div className="flex items-center gap-2 px-3 py-2">
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{name}</span>
                </div>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setSettingsTab("general");
                    setIsSettingsOpen(true);
                    setIsMenuOpen(false);
                  }}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    setSettingsTab("profile");
                    setIsSettingsOpen(true);
                    setIsMenuOpen(false);
                  }}
                >
                  <UserCircle className="mr-2 h-4 w-4" />
                  Profile
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    router.push("/help");
                    setIsMenuOpen(false);
                  }}
                >
                  <HelpCircle className="mr-2 h-4 w-4" />
                  Help
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={async () => {
                    await apiFetch("/api/auth/logout", { method: "POST" });
                    router.push("/login");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          </aside>
        </>
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
      />
    </>
  );
}

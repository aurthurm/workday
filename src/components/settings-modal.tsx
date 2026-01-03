"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SettingsTab =
  | "profile"
  | "subscription"
  | "general"
  | "categories"
  | "integrations"
  | "ai"
  | "due_dates";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

type ProfileResponse = {
  user: { id: string; name: string; email: string };
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceType: string;
    role: string;
  }>;
};

type SettingsResponse = {
  settings: {
    appearance: "light" | "dark";
    task_add_position: "top" | "bottom";
    default_est_minutes: number;
    due_soon_days: number;
    ai_confirm: number;
    ai_routine: string | null;
    ai_work_hours: string | null;
    ai_preferences: string | null;
  };
};

type CategoryResponse = {
  categories: Array<{ id: string; name: string; color: string }>;
  role: "member" | "supervisor" | "admin";
};

const defaultCategories: Array<{ id: string; name: string; color: string }> = [
  { id: "default-admin", name: "Admin", color: "#2563eb" },
  { id: "default-technical", name: "Technical", color: "#0f766e" },
  { id: "default-field", name: "Field", color: "#16a34a" },
  { id: "default-other", name: "Other", color: "#64748b" },
];

const applyTheme = (appearance: "light" | "dark") => {
  const root = document.documentElement;
  root.classList.toggle("dark", appearance === "dark");
};

export function SettingsModal({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: SettingsModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch<ProfileResponse>("/api/profile"),
    enabled: isOpen,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/settings"),
    enabled: isOpen,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<CategoryResponse>("/api/categories"),
    enabled: isOpen,
  });

  const [profileDraft, setProfileDraft] = useState({ name: "", email: "" });
  const [passwordDraft, setPasswordDraft] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [profileFeedback, setProfileFeedback] = useState("");

  useEffect(() => {
    if (profileQuery.data?.user) {
      setProfileDraft({
        name: profileQuery.data.user.name,
        email: profileQuery.data.user.email,
      });
    }
  }, [profileQuery.data?.user]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/profile", {
        method: "PUT",
        body: {
          name: profileDraft.name.trim(),
          email: profileDraft.email.trim(),
        },
      }),
    onSuccess: async () => {
      setProfileFeedback("Profile updated.");
      await profileQuery.refetch();
    },
    onError: (error: Error) => setProfileFeedback(error.message),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/profile", {
        method: "PUT",
        body: {
          currentPassword: passwordDraft.current,
          newPassword: passwordDraft.next,
        },
      }),
    onSuccess: () => {
      setPasswordDraft({ current: "", next: "", confirm: "" });
      setProfileFeedback("Password updated.");
    },
    onError: (error: Error) => setProfileFeedback(error.message),
  });

  const [settingsDraft, setSettingsDraft] = useState({
    appearance: "light" as "light" | "dark",
    taskAddPosition: "bottom" as "top" | "bottom",
    defaultEstMinutes: 15,
    dueSoonDays: 3,
    aiConfirm: true,
    aiRoutine: "",
    aiWorkHours: "",
    aiPreferences: "",
  });
  const [settingsFeedback, setSettingsFeedback] = useState("");

  useEffect(() => {
    const data = settingsQuery.data?.settings;
    if (!data) return;
    setSettingsDraft({
      appearance: data.appearance,
      taskAddPosition: data.task_add_position,
      defaultEstMinutes: data.default_est_minutes,
      dueSoonDays: data.due_soon_days,
      aiConfirm: Boolean(data.ai_confirm),
      aiRoutine: data.ai_routine ?? "",
      aiWorkHours: data.ai_work_hours ?? "",
      aiPreferences: data.ai_preferences ?? "",
    });
  }, [settingsQuery.data?.settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: async () => {
      setSettingsFeedback("Saved.");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => setSettingsFeedback(error.message),
  });

  const [categoryDraft, setCategoryDraft] = useState({
    name: "",
    color: "#64748b",
  });
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryDraft, setEditCategoryDraft] = useState({
    name: "",
    color: "#64748b",
  });
  const [categoryFeedback, setCategoryFeedback] = useState("");

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/categories", {
        method: "POST",
        body: { name: categoryDraft.name, color: categoryDraft.color },
      }),
    onSuccess: () => {
      setCategoryDraft({ name: "", color: "#64748b" });
      setCategoryFeedback("");
      categoriesQuery.refetch();
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; color: string }) =>
      apiFetch("/api/categories", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: () => {
      setEditCategoryId(null);
      setEditCategoryDraft({ name: "", color: "#64748b" });
      setCategoryFeedback("");
      categoriesQuery.refetch();
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/categories?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setCategoryFeedback("");
      categoriesQuery.refetch();
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  const categoriesSorted = useMemo(() => {
    const list = categoriesQuery.data?.categories ?? defaultCategories;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [categoriesQuery.data?.categories]);

  if (!isOpen || !isMounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative h-[90vh] w-[90vw] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <h3 className="text-lg font-display text-foreground">Settings</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid h-[calc(90vh-68px)] gap-4 lg:grid-cols-[260px_1fr]">
          <div className="h-full overflow-y-auto border-r border-border/70 bg-muted/60 p-4 text-sm">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  User settings
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "profile" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("profile")}
                  >
                    Profile
                    <p className="text-xs text-muted-foreground">Account settings</p>
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "subscription" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("subscription")}
                  >
                    Subscription
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Generic
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "general" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("general")}
                  >
                    General settings
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "categories" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("categories")}
                  >
                    Categories
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "integrations" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("integrations")}
                  >
                    Integrations
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Supremacy
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "ai" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("ai")}
                  >
                    AI Assistant
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "due_dates" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("due_dates")}
                  >
                    Due dates
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="h-full overflow-y-auto p-6 text-sm text-muted-foreground">
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Profile
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Update your account details and manage your password.
                  </p>
                </div>
                {profileFeedback && (
                  <p className="text-sm text-muted-foreground">{profileFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Account</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Name
                      </span>
                      <Input
                        value={profileDraft.name}
                        onChange={(event) =>
                          setProfileDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Email
                      </span>
                      <Input
                        type="email"
                        value={profileDraft.email}
                        onChange={(event) =>
                          setProfileDraft((prev) => ({
                            ...prev,
                            email: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      onClick={() => updateProfileMutation.mutate()}
                      disabled={
                        updateProfileMutation.isPending ||
                        !profileDraft.name.trim() ||
                        !profileDraft.email.trim()
                      }
                    >
                      Save account
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Change password</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Current password
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.current}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            current: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        New password
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.next}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            next: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Confirm
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.confirm}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            confirm: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      onClick={() => {
                        if (passwordDraft.next !== passwordDraft.confirm) {
                          setProfileFeedback("Passwords do not match.");
                          return;
                        }
                        updatePasswordMutation.mutate();
                      }}
                      disabled={
                        updatePasswordMutation.isPending ||
                        !passwordDraft.current ||
                        !passwordDraft.next
                      }
                    >
                      Update password
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Workspaces</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {profileQuery.data?.memberships?.map((membership) => (
                      <div
                        key={membership.workspaceId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/60 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {membership.workspaceName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {membership.workspaceType}
                          </p>
                        </div>
                        <Badge variant="outline">{membership.role}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "subscription" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Subscription
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Manage your membership plan and billing.
                  </p>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Current plan</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-border/70 bg-muted/60 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        Free
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Basic access to daily planning and collaboration.
                      </p>
                    </div>
                    <Button>Upgrade to Pro</Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "general" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    General settings
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Control appearance and new task defaults.
                  </p>
                </div>
                {settingsFeedback && (
                  <p className="text-sm text-muted-foreground">{settingsFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Theme
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.appearance}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            appearance: event.target.value as "light" | "dark",
                          }))
                        }
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Add new task to
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.taskAddPosition}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            taskAddPosition: event.target.value as
                              | "top"
                              | "bottom",
                          }))
                        }
                      >
                        <option value="top">Top of list</option>
                        <option value="bottom">Bottom of list</option>
                      </select>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Default estimate
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.defaultEstMinutes}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            defaultEstMinutes: Number(event.target.value),
                          }))
                        }
                      >
                        {Array.from({ length: 7 }, (_, index) => index * 10).map(
                          (value) => (
                            <option key={value} value={value}>
                              {value} mins
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <Button
                      onClick={() => {
                        updateSettingsMutation.mutate({
                          appearance: settingsDraft.appearance,
                          taskAddPosition: settingsDraft.taskAddPosition,
                          defaultEstMinutes: settingsDraft.defaultEstMinutes,
                        });
                        applyTheme(settingsDraft.appearance);
                      }}
                    >
                      Save changes
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "categories" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Categories
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Admins and supervisors can manage task categories.
                  </p>
                </div>
                {categoryFeedback && (
                  <p className="text-sm text-destructive">{categoryFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Workspace categories</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(categoriesQuery.data?.role ?? "member") === "member" && (
                      <p className="text-sm text-muted-foreground">
                        You don&apos;t have permission to add or remove categories.
                      </p>
                    )}
                    <div className="space-y-2">
                      {categoriesSorted.map((category) => {
                        const isEditing = editCategoryId === category.id;
                        return (
                          <div
                            key={category.id}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                          >
                            {isEditing ? (
                              <>
                                <Input
                                  className="min-w-[180px] flex-1"
                                  value={editCategoryDraft.name}
                                  onChange={(event) =>
                                    setEditCategoryDraft((prev) => ({
                                      ...prev,
                                      name: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  type="color"
                                  className="h-9 w-12 p-1"
                                  value={editCategoryDraft.color}
                                  onChange={(event) =>
                                    setEditCategoryDraft((prev) => ({
                                      ...prev,
                                      color: event.target.value,
                                    }))
                                  }
                                />
                              </>
                            ) : (
                              <>
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: category.color }}
                                />
                                <span className="text-sm text-foreground">
                                  {category.name}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {category.color}
                                </Badge>
                              </>
                            )}
                            {(categoriesQuery.data?.role ?? "member") !==
                              "member" && (
                              <div className="ml-auto flex items-center gap-2">
                                {isEditing ? (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        updateCategoryMutation.mutate({
                                          id: category.id,
                                          name: editCategoryDraft.name.trim(),
                                          color: editCategoryDraft.color,
                                        })
                                      }
                                      disabled={!editCategoryDraft.name.trim()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditCategoryId(null);
                                        setEditCategoryDraft({
                                          name: "",
                                          color: "#64748b",
                                        });
                                        setCategoryFeedback("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditCategoryId(category.id);
                                        setEditCategoryDraft({
                                          name: category.name,
                                          color: category.color,
                                        });
                                        setCategoryFeedback("");
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        deleteCategoryMutation.mutate(category.id)
                                      }
                                    >
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {categoriesSorted.length === 0 && (
                        <p className="text-sm text-muted-foreground">No categories yet.</p>
                      )}
                    </div>
                    {(categoriesQuery.data?.role ?? "member") !== "member" && (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          className="min-w-[220px] flex-1"
                          placeholder="Add category"
                          value={categoryDraft.name}
                          onChange={(event) =>
                            setCategoryDraft((prev) => ({
                              ...prev,
                              name: event.target.value,
                            }))
                          }
                        />
                        <Input
                          type="color"
                          className="h-9 w-12 p-1"
                          value={categoryDraft.color}
                          onChange={(event) =>
                            setCategoryDraft((prev) => ({
                              ...prev,
                              color: event.target.value,
                            }))
                          }
                          title="Pick a color"
                        />
                        <Button
                          onClick={() => createCategoryMutation.mutate()}
                          disabled={!categoryDraft.name.trim()}
                        >
                          Add category
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "integrations" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Integrations
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Future use. Connect external tools here when available.
                  </p>
                </div>
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    Integrations are coming soon.
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    AI Assistant
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Configure how the assistant helps with scheduling.
                  </p>
                </div>
                {settingsFeedback && (
                  <p className="text-sm text-muted-foreground">{settingsFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={settingsDraft.aiConfirm}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            aiConfirm: event.target.checked,
                          }))
                        }
                      />
                      Require confirmation before modifying data
                    </label>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Daily routine
                      </span>
                      <Textarea
                        value={settingsDraft.aiRoutine}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            aiRoutine: event.target.value,
                          }))
                        }
                        placeholder="Describe your daily routine."
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Preferred work hours
                      </span>
                      <Input
                        value={settingsDraft.aiWorkHours}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            aiWorkHours: event.target.value,
                          }))
                        }
                        placeholder="e.g. 9:00-17:00"
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Scheduling preferences
                      </span>
                      <Textarea
                        value={settingsDraft.aiPreferences}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            aiPreferences: event.target.value,
                          }))
                        }
                        placeholder="Preferences for how tasks should be arranged."
                      />
                    </div>
                    <Button
                      onClick={() =>
                        updateSettingsMutation.mutate({
                          aiConfirm: settingsDraft.aiConfirm,
                          aiRoutine: settingsDraft.aiRoutine,
                          aiWorkHours: settingsDraft.aiWorkHours,
                          aiPreferences: settingsDraft.aiPreferences,
                        })
                      }
                    >
                      Save AI settings
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "due_dates" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Due dates
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Control when tasks show a due-soon indicator.
                  </p>
                </div>
                {settingsFeedback && (
                  <p className="text-sm text-muted-foreground">{settingsFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Due soon indicator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Window (days)
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={30}
                        value={settingsDraft.dueSoonDays}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            dueSoonDays: Number(event.target.value),
                          }))
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Tasks due within this window will show a badge in task lists.
                    </p>
                    <Button
                      onClick={() =>
                        updateSettingsMutation.mutate({
                          dueSoonDays: settingsDraft.dueSoonDays,
                        })
                      }
                    >
                      Save due date settings
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

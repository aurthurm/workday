"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatDateLabel, toDateInputValue } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/time";
import { TaskListDetailPanel } from "@/components/task-list-detail-panel";
import { useEntitlements } from "@/hooks/use-entitlements";

type PlanResponse = {
  plan: null | {
    id: string;
    date: string;
    visibility: "team" | "private";
    submitted: boolean;
    reviewed: boolean;
    tasks: Array<{
      id: string;
      title: string;
      category: string;
      estimated_minutes: number | null;
      actual_minutes: number | null;
      status: "planned" | "done" | "skipped" | "cancelled";
      notes: string | null;
      priority: "high" | "medium" | "low" | "none";
      due_date: string | null;
      repeat_till: string | null;
      recurrence_rule: string | null;
      recurrence_time: string | null;
      recurrence_active: number;
      recurrence_parent_id: string | null;
      recurrence_start_date: string | null;
      start_time: string | null;
      end_time: string | null;
      attachments: Array<{ id: string; url: string }>;
      subtasks: Array<{
        id: string;
        title: string;
        completed: number;
        estimated_minutes: number | null;
        actual_minutes: number | null;
        start_time: string | null;
        end_time: string | null;
      }>;
    }>;
    reflection: {
      what_went_well: string;
      blockers: string;
      tomorrow_focus: string;
    };
    comments: Array<{
      id: string;
      task_id?: string | null;
      content: string;
      created_at: string;
      author_name: string;
    }>;
  };
};

type WorkspacesResponse = {
  activeWorkspaceId: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    type: "personal" | "organization";
    role: string;
  }>;
};

const defaultCategories = [
  { name: "Admin", color: "#2563eb" },
  { name: "Technical", color: "#0f766e" },
  { name: "Field", color: "#16a34a" },
  { name: "Other", color: "#64748b" },
];
const statuses = ["planned", "done", "cancelled"] as const;
const priorities = ["none", "low", "medium", "high"] as const;
const statusLabel = (status: string) =>
  status === "skipped" ? "cancelled" : status;
const formatEstimated = (minutes: number | null) => {
  if (!minutes || minutes <= 0) return "0.00";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}.${String(mins).padStart(2, "0")}`;
};

export default function TodayClient() {
  const entitlementsQuery = useEntitlements();
  const canPlanFuture =
    entitlementsQuery.data?.entitlements.features["feature.future_plans"] ?? false;
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [newTask, setNewTask] = useState({
    title: "",
    category: defaultCategories[0].name,
    estimatedMinutes: "",
    startTime: "",
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reflection, setReflection] = useState({
    what_went_well: "",
    blockers: "",
    tomorrow_focus: "",
  });
  const [comment, setComment] = useState("");

  const dateValue = useMemo(
    () => toDateInputValue(selectedDate),
    [selectedDate]
  );

  const planQuery = useQuery({
    queryKey: ["plan", dateValue],
    queryFn: () => apiFetch<PlanResponse>(`/api/plans?date=${dateValue}`),
  });

  const plan = planQuery.data?.plan ?? null;

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspacesResponse>("/api/workspaces"),
  });
  const activeWorkspaceId = workspacesQuery.data?.activeWorkspaceId ?? "none";
  const activeWorkspace = workspacesQuery.data?.workspaces?.find(
    (workspace) => workspace.id === activeWorkspaceId
  );
  const visibilityLabel =
    activeWorkspace?.type === "personal" ? "Private" : "Team";

  const categoriesQuery = useQuery({
    queryKey: ["categories", activeWorkspaceId],
    queryFn: () =>
      apiFetch<{
        categories: Array<{ id: string; name: string; color: string }>;
      }>("/api/categories"),
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ settings: { task_add_position: string; default_est_minutes: number; due_soon_days: number } }>("/api/settings"),
  });
  const taskAddPosition = settingsQuery.data?.settings.task_add_position ?? "bottom";
  const defaultEstMinutes = settingsQuery.data?.settings.default_est_minutes ?? 15;
  const dueSoonDays = settingsQuery.data?.settings.due_soon_days ?? 3;
  const categoryList = categoriesQuery.data?.categories ?? defaultCategories;
  const categories = useMemo(
    () => categoryList.map((category) => category.name),
    [categoryList]
  );
  const categoryColors = useMemo(
    () =>
      new Map(
        categoryList.map((category) => [category.name, category.color] as const)
      ),
    [categoryList]
  );
  const getCategoryColor = (name: string) =>
    categoryColors.get(name) ?? "#64748b";

  useEffect(() => {
    setNewTask((prev) => ({
      ...prev,
      category: categories[0] ?? defaultCategories[0].name,
    }));
  }, [categories]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setNewTask((prev) => {
      if (prev.title || prev.estimatedMinutes) return prev;
      return { ...prev, estimatedMinutes: String(defaultEstMinutes) };
    });
  }, [defaultEstMinutes, settingsQuery.data]);

  const emitTimelineUpdate = () => {
    window.dispatchEvent(new Event("timeline:updated"));
  };

  const createPlanMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/api/plans", {
        method: "POST",
        body: { date: dateValue, visibility: "team" },
      }),
    onSuccess: () => planQuery.refetch(),
  });

  const addTaskMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/api/tasks", {
        method: "POST",
        body: {
          dailyPlanId: plan?.id,
          title: newTask.title,
          category: newTask.category,
          estimatedMinutes: newTask.estimatedMinutes
            ? Number(newTask.estimatedMinutes)
            : null,
          startTime: newTask.startTime || null,
          position: taskAddPosition === "top" ? 0 : undefined,
        },
      }),
    onSuccess: () => {
      setNewTask({
        title: "",
        category: categories[0] ?? defaultCategories[0].name,
        estimatedMinutes: String(defaultEstMinutes),
        startTime: "",
      });
      planQuery.refetch();
      emitTimelineUpdate();
    },
  });


  const updatePlanMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch(`/api/plans/${plan?.id}`, {
        method: "PUT",
        body: payload,
      }),
    onSuccess: () => planQuery.refetch(),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>("/api/comments", {
        method: "POST",
        body: { dailyPlanId: plan?.id, content: comment },
      }),
    onSuccess: () => {
      setComment("");
      planQuery.refetch();
    },
  });

  const taskCommentMutation = useMutation({
    mutationFn: (payload: { taskId: string; content: string }) =>
      apiFetch<{ id: string }>("/api/comments", {
        method: "POST",
        body: { dailyPlanId: plan?.id, taskId: payload.taskId, content: payload.content },
      }),
    onSuccess: () => planQuery.refetch(),
  });

  const summary = useMemo(() => {
    if (!plan) return null;
    const total = plan.tasks.length;
    const done = plan.tasks.filter((task) => task.status === "done").length;
    return { total, done };
  }, [plan]);

  const getDueBadge = (dueDate: string | null) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) {
      return { label: `Overdue ${Math.abs(diffDays)}d`, className: "bg-red-100 text-red-700" };
    }
    if (diffDays === 0) {
      return { label: "Due today", className: "bg-amber-100 text-amber-800" };
    }
    if (diffDays <= dueSoonDays) {
      return { label: `Due in ${diffDays}d`, className: "bg-amber-100 text-amber-800" };
    }
    return null;
  };

  useEffect(() => {
    if (plan?.reflection) {
      setReflection(plan.reflection);
    }
  }, [plan?.reflection]);

  useEffect(() => {
    const handlePlansUpdated = () => {
      planQuery.refetch();
    };
    window.addEventListener("plans:updated", handlePlansUpdated);
    return () => window.removeEventListener("plans:updated", handlePlansUpdated);
  }, [planQuery]);


  useEffect(() => {
    if (!plan) {
      setSelectedTaskId(null);
      return;
    }
    if (plan.tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !plan.tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(plan.tasks[0].id);
    }
  }, [plan, plan?.tasks, selectedTaskId]);


  if (planQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading plan...</p>;
  }

  if (planQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        {planQuery.error.message}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-display text-foreground">
            {formatDateLabel(selectedDate)}
          </h3>
          <p className="text-sm text-muted-foreground">
            Capture your plan, then check in as the day moves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={dateValue}
            onChange={(event) => setSelectedDate(new Date(event.target.value))}
            className="w-[160px]"
          />
          {plan && (
            <Badge variant="outline">{visibilityLabel}</Badge>
          )}
          {plan && (
            <Badge variant="outline">
              {plan.submitted ? "Submitted" : "Not submitted"}
            </Badge>
          )}
        </div>
      </div>

      {!plan && (
        <Card className="border border-dashed border-border/80 bg-muted/50">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              There is no plan for this day yet.
            </p>
            {(() => {
              const todayKey = new Date().toISOString().slice(0, 10);
              const isToday = dateValue === todayKey;
              const canCreate = isToday || canPlanFuture;
              return (
            <Button
                  onClick={() => createPlanMutation.mutate()}
                  disabled={!canCreate || createPlanMutation.isPending}
                  title={
                    !canCreate ? "Upgrade to create future plans." : undefined
                  }
            >
                  {isToday
                    ? "Start today's plan"
                    : canPlanFuture
                    ? "Start future plan"
                    : "Upgrade to plan ahead"}
            </Button>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {plan && (
        <div className="space-y-6">
          <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Tasks</CardTitle>
                {summary && (
                  <Badge variant="outline">
                    {summary.done}/{summary.total} done
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3 rounded-2xl border border-border/70 bg-muted/50 p-3">
                  <div className="min-w-[180px] flex-1 space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Task title
                    </span>
                    <Input
                      placeholder="Add a task"
                      value={newTask.title}
                      onChange={(event) =>
                        setNewTask((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Category
                    </span>
                    <Select
                      value={newTask.category}
                      onValueChange={(value) =>
                        setNewTask((prev) => ({ ...prev, category: value }))
                      }
                    >
                      <SelectTrigger className="w-[140px] bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category} value={category}>
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: getCategoryColor(category) }}
                              />
                              {category}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Est. minutes
                    </span>
                    <Input
                      type="number"
                      className="w-[140px]"
                      placeholder="Est. mins"
                      value={newTask.estimatedMinutes}
                      onChange={(event) =>
                        setNewTask((prev) => ({
                          ...prev,
                          estimatedMinutes: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Start time
                    </span>
                    <Input
                      type="time"
                      className="w-[140px]"
                      placeholder="Start"
                      value={newTask.startTime}
                      onChange={(event) =>
                        setNewTask((prev) => ({
                          ...prev,
                          startTime: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => addTaskMutation.mutate()}
                      disabled={!newTask.title || addTaskMutation.isPending}
                    >
                      {addTaskMutation.isPending ? "Adding..." : "Add"}
                    </Button>
                  </div>
                </div>

                <TaskListDetailPanel
                  tasks={plan.tasks}
                  date={plan.date}
                  comments={plan.comments}
                  categories={categories}
                  getCategoryColor={getCategoryColor}
                  statusLabel={statusLabel}
                  statuses={statuses}
                  priorities={priorities}
                  selectedTaskId={selectedTaskId}
                  onSelectTaskId={setSelectedTaskId}
                  listReadOnly
                  detailReadOnly={false}
                  onSaveTitle={async (taskId, _day, title) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: { title },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onSaveTime={async (taskId, _day, startTime, estimatedMinutes) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: {
                        startTime: startTime || null,
                        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
                      },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onSaveCategory={async (taskId, _day, category) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: { category },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onSaveRecurrence={async (taskId, _day, recurrenceRule) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: { recurrenceRule },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onSetRepeatTill={async (taskId, _day, repeatTill) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: { repeatTill },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onDeleteRepeat={async (taskId) => {
                    await apiFetch(`/api/tasks/${taskId}`, {
                      method: "PUT",
                      body: { recurrenceRule: null, repeatTill: null },
                    });
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                  onAddComment={(taskId, content) =>
                    taskCommentMutation.mutate({ taskId, content })
                  }
                  onUpdated={() => {
                    planQuery.refetch();
                    emitTimelineUpdate();
                  }}
                />
              </CardContent>
            </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan comments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {plan.comments.filter((note) => !note.task_id).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No comments yet. Supervisors can add guidance here.
                  </p>
                )}
                {plan.comments
                  .filter((note) => !note.task_id)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-border/70 bg-muted/60 p-3 text-sm"
                    >
                      <p className="text-muted-foreground">{note.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{note.author_name}</Badge>
                        <span>{formatRelativeTime(note.created_at)}</span>
                      </div>
                    </div>
                  ))}
              </div>
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Leave encouragement or guidance."
              />
              <Button
                onClick={() => commentMutation.mutate()}
                disabled={!comment.trim() || commentMutation.isPending}
              >
                {commentMutation.isPending ? "Saving..." : "Add comment"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Reflection</CardTitle>
              {plan.reviewed && (
                <Badge variant="outline">Reviewed</Badge>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={reflection.what_went_well}
                onChange={(event) =>
                  setReflection((prev) => ({
                    ...prev,
                    what_went_well: event.target.value,
                  }))
                }
                placeholder="What went well today?"
              />
              <Textarea
                value={reflection.blockers}
                onChange={(event) =>
                  setReflection((prev) => ({
                    ...prev,
                    blockers: event.target.value,
                  }))
                }
                placeholder="Any blockers?"
              />
              <Textarea
                value={reflection.tomorrow_focus}
                onChange={(event) =>
                  setReflection((prev) => ({
                    ...prev,
                    tomorrow_focus: event.target.value,
                  }))
                }
                placeholder="Focus for tomorrow"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => updatePlanMutation.mutate({ reflection })}>
                  Save reflection
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    updatePlanMutation.mutate({ submitted: !plan.submitted })
                  }
                >
                  {plan.submitted ? "Reopen day" : "Submit day"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

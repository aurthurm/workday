"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatDateLabel, toDateInputValue } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/time";

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

const defaultCategories = [
  { name: "Admin", color: "#2563eb" },
  { name: "Technical", color: "#0f766e" },
  { name: "Field", color: "#16a34a" },
  { name: "Other", color: "#64748b" },
];
const statuses = ["planned", "done", "cancelled"] as const;
const priorities = ["none", "low", "medium", "high"] as const;
  const recurrenceOptions = [
    { value: "none", label: "Does not repeat" },
  { value: "daily_weekdays", label: "Daily (M-F)" },
  { value: "weekly", label: "Weekly (this day)" },
  { value: "biweekly", label: "Every 2 weeks (this day)" },
  { value: "monthly", label: "Every month (this weekday)" },
  { value: "monthly_nth_weekday", label: "Every month (2nd of this weekday)" },
  { value: "quarterly", label: "Quarterly (this weekday)" },
  { value: "yearly", label: "Yearly (this weekday)" },
  { value: "custom", label: "Custom" },
    { value: "specific_time", label: "At specific time" },
  ];
const statusLabel = (status: string) =>
  status === "skipped" ? "cancelled" : status;

export default function TodayClient() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [newTask, setNewTask] = useState({
    title: "",
    category: defaultCategories[0].name,
    estimatedMinutes: "",
    startTime: "",
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
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
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      updates: Record<string, unknown>;
    }) =>
      apiFetch(`/api/tasks/${payload.id}`, {
        method: "PUT",
        body: payload.updates,
      }),
    onSuccess: () => planQuery.refetch(),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => planQuery.refetch(),
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

  const uploadAttachment = async (taskId: string) => {
    if (attachmentFiles.length === 0) return;
    for (const file of attachmentFiles) {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/tasks/${taskId}/attachments/upload`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.error ?? "Upload failed.";
        throw new Error(message);
      }
    }
    setAttachmentFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
    await planQuery.refetch();
  };

  const removeAttachmentMutation = useMutation({
    mutationFn: (payload: { taskId: string; attachmentId: string }) =>
      apiFetch(
        `/api/tasks/${payload.taskId}/attachments?attachmentId=${payload.attachmentId}`,
        { method: "DELETE" }
      ),
    onSuccess: () => planQuery.refetch(),
  });

  const subtaskCreateMutation = useMutation({
    mutationFn: (payload: { taskId: string; title: string }) =>
      apiFetch(`/api/tasks/${payload.taskId}/subtasks`, {
        method: "POST",
        body: { title: payload.title },
      }),
    onSuccess: () => {
      setSubtaskDraft("");
      planQuery.refetch();
    },
  });

  const subtaskUpdateMutation = useMutation({
    mutationFn: (payload: {
      taskId: string;
      subtaskId: string;
      completed: boolean;
    }) =>
      apiFetch(`/api/tasks/${payload.taskId}/subtasks`, {
        method: "PUT",
        body: { subtaskId: payload.subtaskId, completed: payload.completed },
      }),
    onSuccess: () => planQuery.refetch(),
  });

  const subtaskDeleteMutation = useMutation({
    mutationFn: (payload: { taskId: string; subtaskId: string }) =>
      apiFetch(
        `/api/tasks/${payload.taskId}/subtasks?subtaskId=${payload.subtaskId}`,
        { method: "DELETE" }
      ),
    onSuccess: () => planQuery.refetch(),
  });

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

  useEffect(() => {
    setSubtaskDraft("");
    setAttachmentFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, [selectedTaskId]);

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
            <Select
              value={plan.visibility}
              onValueChange={(value) =>
                updatePlanMutation.mutate({ visibility: value })
              }
            >
              <SelectTrigger className="w-[140px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
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
            <Button onClick={() => createPlanMutation.mutate()}>
              {dateValue === new Date().toISOString().slice(0, 10)
                ? "Start today's plan"
                : "Start future plan"}
            </Button>
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
                  <Input
                    className="min-w-[180px] flex-1"
                    placeholder="Add a task"
                    value={newTask.title}
                    onChange={(event) =>
                      setNewTask((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                  />
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
                  <Button
                    onClick={() => addTaskMutation.mutate()}
                    disabled={!newTask.title || addTaskMutation.isPending}
                  >
                    Add
                  </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
                  <div className="space-y-3">
                    {plan.tasks.map((task) => {
                      const dueBadge = getDueBadge(task.due_date);
                      return (
                        <button
                          key={task.id}
                          className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                            task.id === selectedTaskId
                              ? "border-tide-500 bg-card shadow-lg ring-1 ring-tide-200/70"
                              : "border-border/70 bg-card/70 hover:border-tide-200"
                          }`}
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {task.title}
                            </span>
                            <div className="flex items-center gap-2">
                              {dueBadge && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${dueBadge.className}`}
                                >
                                  {dueBadge.label}
                                </span>
                              )}
                              <span className="status-pill" data-status={task.status}>
                                {statusLabel(task.status)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: getCategoryColor(task.category),
                              }}
                            />
                            {task.category} · est {task.estimated_minutes ?? "-"}
                          </p>
                        </button>
                      );
                    })}
                    {plan.tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No tasks yet for this day.
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
                    {plan.tasks.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Select a task to edit details.
                      </p>
                    )}
                    {plan.tasks.length > 0 && (
                      (() => {
                        const activeTask =
                          plan.tasks.find((task) => task.id === selectedTaskId) ??
                          plan.tasks[0];
                        return (
                          <div key={activeTask.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                Task detail
                              </p>
                              <div className="flex items-center gap-2">
                                <span
                                  className="status-pill"
                                  data-status={activeTask.status}
                                >
                                  {statusLabel(activeTask.status)}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={async () => {
                                    const result = await Swal.fire({
                                      title: "Remove task?",
                                      text: "This cannot be undone.",
                                      icon: "warning",
                                      showCancelButton: true,
                                      confirmButtonText: "Remove",
                                      cancelButtonText: "Cancel",
                                      confirmButtonColor: "#dc2626",
                                    });
                                    if (result.isConfirmed) {
                                      deleteTaskMutation.mutate(activeTask.id);
                                    }
                                  }}
                                  aria-label="Remove task"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Title
                                </span>
                                <Input
                                  defaultValue={activeTask.title}
                                  className="flex-1"
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { title: event.target.value },
                                    })
                                  }
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Category
                                </span>
                                <Select
                                  defaultValue={activeTask.category}
                                  onValueChange={(value) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { category: value },
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-[180px] bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {categories.map((category) => (
                                      <SelectItem key={category} value={category}>
                                        <span className="flex items-center gap-2">
                                          <span
                                            className="h-2 w-2 rounded-full"
                                            style={{
                                              backgroundColor: getCategoryColor(category),
                                            }}
                                          />
                                          {category}
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Status
                                </span>
                                <Select
                                  defaultValue={activeTask.status}
                                  onValueChange={(value) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { status: value },
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-[160px] bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {statuses.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {statusLabel(status)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Timing
                                </span>
                                <Input
                                  type="number"
                                  defaultValue={activeTask.estimated_minutes ?? ""}
                                  className="w-[120px]"
                                  placeholder="Est."
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: {
                                        estimatedMinutes: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                      },
                                    })
                                  }
                                />
                                <Input
                                  type="time"
                                  defaultValue={
                                    activeTask.start_time
                                      ? new Date(
                                          activeTask.start_time
                                        ).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          hour12: false,
                                        })
                                      : ""
                                  }
                                  className="w-[140px]"
                                  placeholder="Start"
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { startTime: event.target.value },
                                    })
                                  }
                                />
                                <Input
                                  type="number"
                                  defaultValue={activeTask.actual_minutes ?? ""}
                                  className="w-[120px]"
                                  placeholder="Actual"
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: {
                                        actualMinutes: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                      },
                                    })
                                  }
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Due date
                                </span>
                                <Input
                                  type="date"
                                  defaultValue={activeTask.due_date ?? ""}
                                  className="w-[180px]"
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { dueDate: event.target.value || null },
                                    })
                                  }
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Priority
                                </span>
                                <Select
                                  defaultValue={activeTask.priority ?? "none"}
                                  onValueChange={(value) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { priority: value },
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-[160px] bg-card">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {priorities.map((priority) => (
                                      <SelectItem key={priority} value={priority}>
                                        {priority}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Notes
                                </span>
                                <Textarea
                                  defaultValue={activeTask.notes ?? ""}
                                  placeholder="Notes"
                                  className="flex-1"
                                  onBlur={(event) =>
                                    updateTaskMutation.mutate({
                                      id: activeTask.id,
                                      updates: { notes: event.target.value },
                                    })
                                  }
                                />
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Attachments
                                </span>
                                <div className="flex-1 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted">
                                      <input
                                        ref={attachmentInputRef}
                                        type="file"
                                        multiple
                                        className="sr-only"
                                        onChange={(event) =>
                                          setAttachmentFiles(
                                            Array.from(event.target.files ?? [])
                                          )
                                        }
                                      />
                                      Choose files
                                      {attachmentFiles.length > 0 && (
                                        <span className="text-muted-foreground">
                                          ({attachmentFiles.length})
                                        </span>
                                      )}
                                    </label>
                                    <Button
                                      onClick={() => uploadAttachment(activeTask.id)}
                                      disabled={attachmentFiles.length === 0}
                                    >
                                      Upload
                                    </Button>
                                  </div>
                                  <div className="space-y-2">
                                    {activeTask.attachments.map((attachment) => {
                                      const filename =
                                        attachment.url.split("/").pop() ??
                                        attachment.url;
                                      return (
                                        <div
                                          key={attachment.id}
                                          className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground"
                                        >
                                          <span className="truncate text-muted-foreground">
                                            {filename}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <a
                                              href={attachment.url}
                                              className="text-muted-foreground hover:text-foreground"
                                              download
                                            >
                                              Download
                                            </a>
                                            <button
                                              className="text-muted-foreground hover:text-foreground"
                                              onClick={() =>
                                                removeAttachmentMutation.mutate({
                                                  taskId: activeTask.id,
                                                  attachmentId: attachment.id,
                                                })
                                              }
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {activeTask.attachments.length === 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        No attachments yet.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Subtasks
                                </span>
                                <div className="flex-1 space-y-2">
                                  <div className="flex flex-wrap gap-2">
                                    <Input
                                      value={subtaskDraft}
                                      placeholder="Add a subtask"
                                      onChange={(event) =>
                                        setSubtaskDraft(event.target.value)
                                      }
                                      className="flex-1"
                                    />
                                    <Button
                                      onClick={() =>
                                        subtaskCreateMutation.mutate({
                                          taskId: activeTask.id,
                                          title: subtaskDraft,
                                        })
                                      }
                                      disabled={!subtaskDraft.trim()}
                                    >
                                      Add
                                    </Button>
                                  </div>
                                  <div className="space-y-2">
                                  {activeTask.subtasks.map((subtask) => (
                                    <div
                                      key={subtask.id}
                                      className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
                                    >
                                      <label className="flex items-center gap-2 text-muted-foreground">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(subtask.completed)}
                                          onChange={(event) =>
                                            subtaskUpdateMutation.mutate({
                                              taskId: activeTask.id,
                                              subtaskId: subtask.id,
                                              completed: event.target.checked,
                                            })
                                          }
                                        />
                                        <span
                                          className={
                                            subtask.completed
                                              ? "line-through text-muted-foreground"
                                              : ""
                                          }
                                        >
                                          {subtask.title}
                                        </span>
                                      </label>
                                      <button
                                        className="text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                          subtaskDeleteMutation.mutate({
                                            taskId: activeTask.id,
                                            subtaskId: subtask.id,
                                          })
                                        }
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                  {activeTask.subtasks.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      No subtasks yet.
                                    </p>
                                  )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Recurring
                                </span>
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                  <Select
                                    defaultValue={activeTask.recurrence_rule ?? "none"}
                                    onValueChange={(value) =>
                                      updateTaskMutation.mutate({
                                        id: activeTask.id,
                                        updates: {
                                          recurrenceRule: value === "none" ? null : value,
                                        },
                                      })
                                    }
                                  >
                                    <SelectTrigger className="w-[220px] bg-card">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {recurrenceOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {activeTask.recurrence_rule === "specific_time" && (
                                    <Input
                                      type="time"
                                      defaultValue={activeTask.recurrence_time ?? ""}
                                      onBlur={(event) =>
                                        updateTaskMutation.mutate({
                                          id: activeTask.id,
                                          updates: { recurrenceTime: event.target.value },
                                        })
                                      }
                                      className="w-[140px]"
                                    />
                                  )}
                                  {activeTask.recurrence_rule &&
                                    activeTask.recurrence_rule !== "none" && (
                                      <>
                                        <Button
                                          variant="outline"
                                          onClick={async () => {
                                            const result = await Swal.fire({
                                              title: "Set final repeat date",
                                              text: "Choose the last date this repeat should appear.",
                                              input: "date",
                                              showCancelButton: true,
                                              confirmButtonText: "Save",
                                              cancelButtonText: "Cancel",
                                            });
                                            if (result.isConfirmed && result.value) {
                                              updateTaskMutation.mutate({
                                                id: activeTask.id,
                                                updates: { repeatTill: result.value },
                                              });
                                            }
                                          }}
                                        >
                                          Cancel repeat
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          onClick={() =>
                                            updateTaskMutation.mutate({
                                              id: activeTask.id,
                                              updates: { recurrenceRule: null },
                                            })
                                          }
                                        >
                                          Delete repeat
                                        </Button>
                                        <Button
                                          variant="destructive"
                                          onClick={async () => {
                                            const result = await Swal.fire({
                                              title: "Delete all instances?",
                                              text: "This removes every future occurrence.",
                                              icon: "warning",
                                              showCancelButton: true,
                                              confirmButtonText: "Delete all",
                                              cancelButtonText: "Cancel",
                                              confirmButtonColor: "#dc2626",
                                            });
                                            if (result.isConfirmed) {
                                              updateTaskMutation.mutate({
                                                id: activeTask.id,
                                                updates: { recurrenceAction: "delete_all" },
                                              });
                                            }
                                          }}
                                        >
                                          Delete all
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                Task comments
                              </p>
                              <div className="space-y-2">
                                {plan.comments
                                  .filter(
                                    (note) => note.task_id === activeTask.id
                                  )
                                  .map((note) => (
                                    <div
                                      key={note.id}
                                      className="rounded-xl border border-border/70 bg-muted/60 p-3 text-sm"
                                    >
                                      <p className="text-muted-foreground">
                                        {note.content}
                                      </p>
                                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                        <Badge variant="outline">
                                          {note.author_name}
                                        </Badge>
                                        <span>
                                          {formatRelativeTime(note.created_at)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                {plan.comments.filter(
                                  (note) => note.task_id === activeTask.id
                                ).length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    No task comments yet.
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
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
                disabled={!comment.trim()}
              >
                Add comment
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

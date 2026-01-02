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
      status: "planned" | "done" | "skipped";
      notes: string | null;
      start_time: string | null;
      end_time: string | null;
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

const defaultCategories = ["Admin", "Technical", "Field", "Other"];
const statuses = ["planned", "done", "skipped"] as const;

export default function TodayClient() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [newTask, setNewTask] = useState({
    title: "",
    category: defaultCategories[0],
    estimatedMinutes: "",
    startTime: "",
  });
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
        categories: Array<{ id: string; name: string }>;
      }>("/api/categories"),
  });
  const categories =
    categoriesQuery.data?.categories.map((category) => category.name) ??
    defaultCategories;

  useEffect(() => {
    setNewTask((prev) => ({
      ...prev,
      category: categories[0] ?? defaultCategories[0],
    }));
  }, [categories]);

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
        },
      }),
    onSuccess: () => {
      setNewTask({
        title: "",
        category: categories[0] ?? defaultCategories[0],
        estimatedMinutes: "",
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

  useEffect(() => {
    if (plan?.reflection) {
      setReflection(plan.reflection);
    }
  }, [plan?.reflection]);

  if (planQuery.isLoading) {
    return <p className="text-sm text-ink-500">Loading plan...</p>;
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
          <h3 className="text-2xl font-display text-ink-900">
            {formatDateLabel(selectedDate)}
          </h3>
          <p className="text-sm text-ink-600">
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
              <SelectTrigger className="w-[140px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!plan && (
        <Card className="border border-dashed border-ink-300/80 bg-ink-50/50">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-ink-600">
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
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
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
                <div className="flex flex-wrap gap-3 rounded-2xl border border-ink-200/70 bg-ink-50/50 p-3">
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
                    <SelectTrigger className="w-[140px] bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
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

                <div className="space-y-3">
                  {plan.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-ink-200/70 bg-white p-4 shadow-inset"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <Input
                          defaultValue={task.title}
                          className="min-w-[180px] flex-1"
                          onBlur={(event) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: { title: event.target.value },
                            })
                          }
                        />
                        <Select
                          defaultValue={task.category}
                          onValueChange={(value) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: { category: value },
                            })
                          }
                        >
                          <SelectTrigger className="w-[140px] bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          defaultValue={task.status}
                          onValueChange={(value) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: { status: value },
                            })
                          }
                        >
                          <SelectTrigger className="w-[120px] bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          defaultValue={task.estimated_minutes ?? ""}
                          className="w-[110px]"
                          placeholder="Est."
                          onBlur={(event) =>
                            updateTaskMutation.mutate({
                              id: task.id,
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
                            task.start_time
                              ? new Date(task.start_time).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })
                              : ""
                          }
                          className="w-[120px]"
                          placeholder="Start"
                          onBlur={(event) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: { startTime: event.target.value },
                            })
                          }
                        />
                        <Input
                          type="number"
                          defaultValue={task.actual_minutes ?? ""}
                          className="w-[110px]"
                          placeholder="Actual"
                          onBlur={(event) =>
                            updateTaskMutation.mutate({
                              id: task.id,
                              updates: {
                                actualMinutes: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              },
                            })
                          }
                        />
                        <Button
                          variant="ghost"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                        >
                          Remove
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                        {task.start_time && (
                          <span>
                            Start:{" "}
                            {new Date(task.start_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {task.end_time && (
                          <span>
                            End:{" "}
                            {new Date(task.end_time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                      <Textarea
                        defaultValue={task.notes ?? ""}
                        className="mt-3"
                        placeholder="Notes or context..."
                        onBlur={(event) =>
                          updateTaskMutation.mutate({
                            id: task.id,
                            updates: { notes: event.target.value },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
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
                  <Button
                    onClick={() =>
                      updatePlanMutation.mutate({ reflection })
                    }
                  >
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

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Completion state</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-ink-600">
                <div className="flex items-center justify-between">
                  <span>Tasks completed</span>
                  <span className="text-ink-900">
                    {summary?.done ?? 0}/{summary?.total ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Visibility</span>
                  <span className="text-ink-900">{plan.visibility}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Submitted</span>
                  <span className="text-ink-900">
                    {plan.submitted ? "Yes" : "No"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {plan.comments.length === 0 && (
                    <p className="text-sm text-ink-500">
                      No comments yet. Supervisors can add guidance here.
                    </p>
                  )}
                  {plan.comments.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-ink-200/70 bg-ink-50/60 p-3 text-sm"
                    >
                      <p className="text-ink-700">{note.content}</p>
                      {note.task_id && (
                        <p className="mt-1 text-xs text-ink-500">
                          Task:{" "}
                          {plan.tasks.find((task) => task.id === note.task_id)
                            ?.title ?? "Task"}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-xs text-ink-500">
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
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toDateInputValue } from "@/lib/date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type TeamPlansResponse = {
  plans: Array<{
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    submitted: number;
    reviewed: number;
    visibility: string;
    task_total: number;
    task_done: number;
    tasks: Array<{
      id: string;
      title: string;
      category: string;
      status: "planned" | "done" | "skipped";
      estimated_minutes: number | null;
      actual_minutes: number | null;
      start_time: string | null;
      end_time: string | null;
    }>;
    comments: Array<{
      id: string;
      task_id: string | null;
      content: string;
      created_at: string;
      author_name: string;
    }>;
  }>;
};

export default function SupervisorPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {}
  );

  const dateValue = useMemo(
    () => toDateInputValue(selectedDate),
    [selectedDate]
  );

  const { data, refetch } = useQuery({
    queryKey: ["team-plans", dateValue],
    queryFn: () => apiFetch<TeamPlansResponse>(`/api/team/plans?date=${dateValue}`),
  });

  const reviewMutation = useMutation({
    mutationFn: (planId: string) =>
      apiFetch(`/api/plans/${planId}`, {
        method: "PUT",
        body: { reviewed: true },
      }),
    onSuccess: () => refetch(),
  });

  const commentMutation = useMutation({
    mutationFn: (payload: {
      planId: string;
      content: string;
      taskId?: string;
    }) =>
      apiFetch("/api/comments", {
        method: "POST",
        body: {
          dailyPlanId: payload.planId,
          taskId: payload.taskId,
          content: payload.content,
        },
      }),
    onSuccess: () => refetch(),
  });

  const plans = data?.plans ?? [];
  const activePlan =
    plans.find((plan) => plan.user_id === selectedMemberId) ?? plans[0];
  const activeTask =
    activePlan?.tasks.find((task) => task.id === selectedTaskId) ??
    activePlan?.tasks[0];

  useEffect(() => {
    if (!selectedMemberId && plans.length > 0) {
      setSelectedMemberId(plans[0].user_id);
    }
  }, [plans, selectedMemberId]);

  useEffect(() => {
    if (activePlan?.tasks.length && !selectedTaskId) {
      setSelectedTaskId(activePlan.tasks[0].id);
    }
  }, [activePlan?.tasks, selectedTaskId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-display text-ink-900">Team overview</h3>
          <p className="text-sm text-ink-600">
            Encourage progress and remove blockers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() =>
              setSelectedDate(
                (prev) => new Date(prev.getTime() - 24 * 60 * 60 * 1000)
              )
            }
          >
            {"<"}
          </Button>
          <Input
            type="date"
            value={dateValue}
            onChange={(event) => setSelectedDate(new Date(event.target.value))}
            className="w-[160px]"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() =>
              setSelectedDate(
                (prev) => new Date(prev.getTime() + 24 * 60 * 60 * 1000)
              )
            }
          >
            {">"}
          </Button>
          <Select
            value={selectedMemberId ?? ""}
            onValueChange={(value) => {
              setSelectedMemberId(value);
              setSelectedTaskId(null);
            }}
          >
            <SelectTrigger className="w-[220px] bg-white">
              <SelectValue placeholder="Filter member" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.user_id} value={plan.user_id}>
                  {plan.user_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activePlan && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{activePlan.user_name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {activePlan.task_done}/{activePlan.task_total} done
              </Badge>
              {activePlan.reviewed ? (
                <Badge variant="outline">Reviewed</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reviewMutation.mutate(activePlan.id)}
                >
                  Mark reviewed
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-ink-600">
            <div className="flex flex-wrap items-center gap-4">
              <span>{activePlan.user_email}</span>
              <span>Visibility: {activePlan.visibility}</span>
              <span>Submitted: {activePlan.submitted ? "Yes" : "No"}</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3 rounded-2xl border border-ink-200/70 bg-ink-50/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                  Tasks for the day
                </p>
                <div className="space-y-2">
                  {activePlan.tasks.map((task) => (
                    <button
                      key={task.id}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                        task.id === activeTask?.id
                          ? "border-tide-500 bg-white shadow-lg ring-1 ring-tide-200/70"
                          : "border-ink-200/70 bg-white/70 hover:border-tide-200"
                      }`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-ink-900">
                          {task.title}
                        </span>
                        <span className="status-pill" data-status={task.status}>
                          {task.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {task.category} · est {task.estimated_minutes ?? "-"} /
                        actual {task.actual_minutes ?? "-"}
                      </p>
                      {(task.start_time || task.end_time) && (
                        <p className="text-xs text-ink-500">
                          {task.start_time
                            ? `Start ${new Date(
                                task.start_time
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : "Start -"}{" "}
                          ·{" "}
                          {task.end_time
                            ? `End ${new Date(
                                task.end_time
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : "End -"}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3 rounded-2xl border border-ink-200/70 bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                    Task detail
                  </p>
                  {activeTask && (
                    <span className="status-pill" data-status={activeTask.status}>
                      {activeTask.status}
                    </span>
                  )}
                </div>
                {activeTask ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-base font-medium text-ink-900">
                        {activeTask.title}
                      </p>
                      <p className="text-xs text-ink-500">
                        {activeTask.category} · est{" "}
                        {activeTask.estimated_minutes ?? "-"} / actual{" "}
                        {activeTask.actual_minutes ?? "-"}
                      </p>
                      {(activeTask.start_time || activeTask.end_time) && (
                        <p className="text-xs text-ink-500">
                          {activeTask.start_time
                            ? `Start ${new Date(
                                activeTask.start_time
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : "Start -"}{" "}
                          ·{" "}
                          {activeTask.end_time
                            ? `End ${new Date(
                                activeTask.end_time
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : "End -"}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                        Task comments
                      </p>
                      {activePlan.comments
                        .filter((comment) => comment.task_id === activeTask.id)
                        .map((note) => (
                          <div
                            key={note.id}
                            className="rounded-lg border border-ink-200/70 bg-ink-50/70 px-3 py-2 text-xs"
                          >
                            <p className="text-ink-700">{note.content}</p>
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                              <Badge variant="outline">{note.author_name}</Badge>
                              <span>{formatRelativeTime(note.created_at)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                    <Textarea
                      value={commentDrafts[activeTask.id] ?? ""}
                      onChange={(event) =>
                        setCommentDrafts((prev) => ({
                          ...prev,
                          [activeTask.id]: event.target.value,
                        }))
                      }
                      placeholder="Leave a task-specific comment."
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => {
                          const content = commentDrafts[activeTask.id];
                          if (!content?.trim()) return;
                          commentMutation.mutate({
                            planId: activePlan.id,
                            taskId: activeTask.id,
                            content,
                          });
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [activeTask.id]: "",
                          }));
                        }}
                      >
                        Comment on task
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink-500">
                    No tasks for this plan.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Plan comments
              </p>
              {activePlan.comments
                .filter((comment) => !comment.task_id)
                .map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-ink-200/70 bg-ink-50/70 px-3 py-2 text-xs"
                  >
                    <p className="text-ink-700">{note.content}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                      <Badge variant="outline">{note.author_name}</Badge>
                      <span>{formatRelativeTime(note.created_at)}</span>
                    </div>
                  </div>
                ))}
            </div>
            <Textarea
              value={commentDrafts[activePlan.id] ?? ""}
              onChange={(event) =>
                setCommentDrafts((prev) => ({
                  ...prev,
                  [activePlan.id]: event.target.value,
                }))
              }
              placeholder="Leave encouragement or guidance."
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  const content = commentDrafts[activePlan.id];
                  if (!content?.trim()) return;
                  commentMutation.mutate({ planId: activePlan.id, content });
                  setCommentDrafts((prev) => ({ ...prev, [activePlan.id]: "" }));
                }}
              >
                Comment on plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

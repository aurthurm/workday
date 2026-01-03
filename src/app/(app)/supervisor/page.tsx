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
import { TaskListDetailPanel } from "@/components/task-list-detail-panel";
import { TaskListItem } from "@/components/task-list-item";
import { TaskDetailPanel } from "@/components/task-detail-panel";

type TeamPlansResponse = {
  plans: Array<{
    id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    date: string;
    submitted: number;
    reviewed: number;
    visibility: string;
    task_total: number;
    task_done: number;
    tasks: Array<{
      id: string;
      title: string;
      category: string;
      status: "planned" | "done" | "skipped" | "cancelled";
      estimated_minutes: number | null;
      actual_minutes: number | null;
      start_time: string | null;
      end_time: string | null;
      notes: string | null;
      priority: "high" | "medium" | "low" | "none";
      due_date: string | null;
      recurrence_rule: string | null;
      recurrence_time: string | null;
      repeat_till: string | null;
      attachments: Array<{ id: string; url: string }>;
      subtasks: Array<{
        id: string;
        title: string;
        completed: number;
      estimated_minutes: number | null;
      actual_minutes: number | null;
      start_time: string | null;
      end_time: string | null;
      notes: string | null;
      priority: "high" | "medium" | "low" | "none";
      due_date: string | null;
      recurrence_rule: string | null;
      recurrence_time: string | null;
      repeat_till: string | null;
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

type WorkspacesResponse = {
  activeWorkspaceId: string | null;
};

const defaultCategories = [
  { name: "Admin", color: "#2563eb" },
  { name: "Technical", color: "#0f766e" },
  { name: "Field", color: "#16a34a" },
  { name: "Other", color: "#64748b" },
];
const normalizeStatus = (status: string) =>
  status === "skipped" ? "cancelled" : status;
const statuses = ["planned", "done", "cancelled", "unplanned"] as const;
const priorities = ["none", "low", "medium", "high"] as const;
const statusLabel = (status: string) => normalizeStatus(status);

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
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspacesResponse>("/api/workspaces"),
  });
  const activeWorkspaceId = workspacesQuery.data?.activeWorkspaceId ?? "none";
  const categoriesQuery = useQuery({
    queryKey: ["categories", activeWorkspaceId],
    queryFn: () =>
      apiFetch<{
        categories: Array<{ id: string; name: string; color: string }>;
      }>("/api/categories"),
  });
  const categoryList = categoriesQuery.data?.categories ?? defaultCategories;
  const categoryColors = useMemo(
    () =>
      new Map(
        categoryList.map((category) => [category.name, category.color] as const)
      ),
    [categoryList]
  );
  const getCategoryColor = (name: string) =>
    categoryColors.get(name) ?? "#64748b";

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
          <h3 className="text-2xl font-display text-foreground">Team overview</h3>
          <p className="text-sm text-muted-foreground">
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
            <SelectTrigger className="w-[220px] bg-card">
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
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <span>{activePlan.user_email}</span>
              <span>Visibility: {activePlan.visibility}</span>
              <span>Submitted: {activePlan.submitted ? "Yes" : "No"}</span>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-muted/60 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Tasks for the day
                </p>
                <div className="mt-3">
                  <TaskListDetailPanel
                    tasks={activePlan.tasks}
                    date={activePlan.date}
                    comments={activePlan.comments}
                    categories={categoryList.map((category) => category.name)}
                    getCategoryColor={getCategoryColor}
                    statusLabel={statusLabel}
                    statuses={statuses}
                    priorities={priorities}
                    selectedTaskId={activeTask?.id ?? null}
                    onSelectTaskId={setSelectedTaskId}
                    listReadOnly
                    detailReadOnly
                    onSaveTitle={async () => {}}
                    onSaveTime={async () => {}}
                    onSaveCategory={async () => {}}
                    onSaveRecurrence={async () => {}}
                    onSetRepeatTill={async () => {}}
                    onDeleteRepeat={async () => {}}
                    onAddComment={(taskId, content) => {
                      commentMutation.mutate({
                        planId: activePlan.id,
                        taskId,
                        content,
                      });
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Plan comments
              </p>
              {activePlan.comments
                .filter((comment) => !comment.task_id)
                .map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg border border-border/70 bg-muted/70 px-3 py-2 text-xs"
                  >
                    <p className="text-muted-foreground">{note.content}</p>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
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

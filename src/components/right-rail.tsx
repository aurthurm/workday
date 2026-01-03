"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import { TaskListItem } from "@/components/task-list-item";
import { TimelinePanel, type TimelineTask } from "@/components/timeline-panel";
import { TaskDetailPanel, type TaskDetailTask } from "@/components/task-detail-panel";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Lightbulb, Clock } from "lucide-react";

type Idea = {
  id: string;
  title: string;
  category: string;
  estimated_minutes: number | null;
  due_date: string | null;
  recurrence_rule: string | null;
  repeat_till: string | null;
  created_at: string;
};

type WorkspacesResponse = {
  activeWorkspaceId: string | null;
};

type TimelinePlanResponse = {
  plan: null | {
    date: string;
    tasks: TimelineTask[];
  };
};

const defaultCategories = [
  { name: "Admin", color: "#2563eb" },
  { name: "Technical", color: "#0f766e" },
  { name: "Field", color: "#16a34a" },
  { name: "Other", color: "#64748b" },
];
const normalizeStatus = (status: string) =>
  status === "skipped" ? "cancelled" : status;
const isCancelledStatus = (status: string) =>
  status === "skipped" || status === "cancelled";
const formatEstimated = (minutes: number | null) => {
  if (!minutes || minutes <= 0) return "0.00";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}.${String(mins).padStart(2, "0")}`;
};
const getStartTimeInput = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "";
const PX_PER_MIN = 1;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const snapMinutes = (minutes: number, snap = 5) =>
  Math.round(minutes / snap) * snap;
const minutesToHHMM = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

export function RightRail() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const showIdeas = pathname === "/today" || pathname === "/history";
  const isHistoryPage = pathname === "/history";
  const [panelOpen, setPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"ideas" | "timeline">("ideas");
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: defaultCategories[0].name,
  });
  const [timelineDetailTask, setTimelineDetailTask] = useState<TaskDetailTask | null>(
    null
  );
  const [timelineVersion, setTimelineVersion] = useState(0);
  const [selectedKanbanDay, setSelectedKanbanDay] = useState<string | null>(null);

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
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      apiFetch<{ settings: { due_soon_days: number } }>("/api/settings"),
    enabled: showIdeas,
  });
  const dueSoonDays = settingsQuery.data?.settings.due_soon_days ?? 3;
  const categoryList = categoriesQuery.data?.categories ?? defaultCategories;
  const rightItems = useMemo(
    () => [
      { id: "ideas" as const, label: "Idea dump", icon: Lightbulb },
      { id: "timeline" as const, label: "Timeline", icon: Clock },
    ],
    []
  );
  const activeItem =
    rightItems.find((item) => item.id === activePanel) ?? rightItems[0];
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

  const timelineDate = useMemo(() => {
    // If on history page and a day is selected in kanban, show that day
    // Otherwise, always default to today
    if (isHistoryPage && selectedKanbanDay) {
      return selectedKanbanDay;
    }
    return new Date().toISOString().slice(0, 10);
  }, [isHistoryPage, selectedKanbanDay]);

  const timelineQuery = useQuery({
    queryKey: ["plan", timelineDate, activeWorkspaceId],
    queryFn: () => apiFetch<TimelinePlanResponse>(`/api/plans?date=${timelineDate}`),
  });
  const timelineTasks = timelineQuery.data?.plan?.tasks ?? [];
  const statusOptions = ["planned", "done", "cancelled", "unplanned"] as const;
  const priorityOptions = ["none", "low", "medium", "high"] as const;
  const statusLabel = (value: string) => normalizeStatus(value);

  const toDetailTask = (task: TimelineTask): TaskDetailTask => {
    const payload = task as TimelineTask & {
      notes?: string | null;
      priority?: "high" | "medium" | "low" | "none";
      due_date?: string | null;
      repeat_till?: string | null;
      recurrence_rule?: string | null;
      recurrence_time?: string | null;
      attachments?: Array<{ id: string; url: string }>;
    };
    return {
      ...task,
      notes: payload.notes ?? null,
      priority: payload.priority ?? "none",
      due_date: payload.due_date ?? null,
      repeat_till: payload.repeat_till ?? null,
      recurrence_rule: payload.recurrence_rule ?? null,
      recurrence_time: payload.recurrence_time ?? null,
      attachments: payload.attachments ?? [],
      subtasks:
        task.subtasks?.map((subtask) => ({
          ...subtask,
          completed: (subtask as { completed?: number }).completed ?? 0,
        })) ?? [],
    };
  };

  const refetchTimeline = async () => {
    await timelineQuery.refetch();
    setTimelineVersion((prev) => prev + 1);
    queryClient.invalidateQueries({ queryKey: ["plan"] });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    queryClient.invalidateQueries({ queryKey: ["ideas"] });
    window.dispatchEvent(new Event("timeline:updated"));
    window.dispatchEvent(new Event("plans:updated"));
  };

  const refreshTimelineAndSync = async (taskId?: string) => {
    const result = await timelineQuery.refetch();
    const updatedTasks = result.data?.plan?.tasks ?? [];
    if (taskId) {
      const updated = updatedTasks.find((task) => task.id === taskId);
      setTimelineDetailTask(updated ? toDetailTask(updated) : null);
    }
    setTimelineVersion((prev) => prev + 1);
    queryClient.invalidateQueries({ queryKey: ["plan"] });
    queryClient.invalidateQueries({ queryKey: ["history"] });
    queryClient.invalidateQueries({ queryKey: ["ideas"] });
    window.dispatchEvent(new Event("timeline:updated"));
    window.dispatchEvent(new Event("plans:updated"));
  };


  useEffect(() => {
    setDraft((prev) => {
      if (categories.length === 0) return prev;
      if (categories.includes(prev.category)) {
        return prev;
      }
      return { ...prev, category: categories[0] };
    });
  }, [categories]);

  useEffect(() => {
    const handleKanbanDaySelected = (event: Event) => {
      const customEvent = event as CustomEvent<{ day: string }>;
      setSelectedKanbanDay(customEvent.detail.day);
    };
    window.addEventListener("kanban:daySelected", handleKanbanDaySelected);
    return () => window.removeEventListener("kanban:daySelected", handleKanbanDaySelected);
  }, []);

  const ideasQuery = useQuery({
    queryKey: ["ideas"],
    queryFn: () => apiFetch<{ ideas: Idea[] }>("/api/tasks?scope=unplanned"),
    enabled: showIdeas,
  });
  const ideas = ideasQuery.data?.ideas ?? [];
  const sortedIdeas = useMemo(() => ideas, [ideas]);

  useEffect(() => {
    if (!showIdeas) return;
    const handleUpdate = () => ideasQuery.refetch();
    window.addEventListener("ideas:updated", handleUpdate);
    return () => window.removeEventListener("ideas:updated", handleUpdate);
  }, [ideasQuery, showIdeas]);

  useEffect(() => {
    if (!panelOpen || activePanel !== "timeline") return;
    timelineQuery.refetch();
  }, [panelOpen, activePanel, timelineQuery]);

  useEffect(() => {
    const handleUpdate = () => timelineQuery.refetch();
    window.addEventListener("timeline:updated", handleUpdate);
    return () => window.removeEventListener("timeline:updated", handleUpdate);
  }, [timelineQuery]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/tasks", {
        method: "POST",
        body: { title: draft.title, category: draft.category },
      }),
    onSuccess: () => {
      ideasQuery.refetch();
      setDraft({ title: "", category: categories[0] ?? "Admin" });
      setShowAddForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => ideasQuery.refetch(),
  });

  const handleIdeaDragStart = (event: DragEvent, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.setData("application/x-task-id", id);
  };

  const handleTitleSave = async (
    taskId: string,
    _day: string,
    title: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, { method: "PATCH", body: { title } });
    ideasQuery.refetch();
  };

  const handleTimeSave = async (
    taskId: string,
    _day: string,
    startTime: string,
    estimatedMinutes: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: {
        start_time: startTime || null,
        estimated_minutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      },
    });
    ideasQuery.refetch();
  };

  const handleCategorySave = async (
    taskId: string,
    _day: string,
    category: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { category },
    });
    ideasQuery.refetch();
  };

  const handleRecurrenceSave = async (
    taskId: string,
    _day: string,
    recurrenceRule: string | null
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { recurrence_rule: recurrenceRule },
    });
    ideasQuery.refetch();
  };

  const handleRepeatTill = async (
    taskId: string,
    _day: string,
    repeatTill: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { repeat_till: repeatTill },
    });
    ideasQuery.refetch();
  };

  const handleDeleteRepeat = async (taskId: string, _day: string) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: { recurrence_rule: null, repeat_till: null },
    });
    ideasQuery.refetch();
  };

  const handleTimelineDragStart = (
    event: DragEvent,
    taskId: string,
    dayKey: string
  ) => {
    event.dataTransfer.setData("text/task-id", taskId);
    event.dataTransfer.setData("text/source-day", dayKey);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleSubtaskDragStart = (
    event: DragEvent,
    subtaskId: string,
    parentTaskId: string,
    dayKey: string
  ) => {
    event.dataTransfer.setData("text/subtask-id", subtaskId);
    event.dataTransfer.setData("text/task-id", parentTaskId);
    event.dataTransfer.setData("text/source-day", dayKey);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleTimelineDrop = async (event: DragEvent) => {
    event.preventDefault();

    const targetDay = timelineDate; // Uses today or selected kanban day
    const taskId = event.dataTransfer.getData("text/task-id");
    const subtaskId = event.dataTransfer.getData("text/subtask-id");
    const sourceDay = event.dataTransfer.getData("text/source-day");

    if ((!taskId && !subtaskId) || !sourceDay) return;

    const targetEl = event.currentTarget as HTMLDivElement;
    const rect = targetEl.getBoundingClientRect();
    const scrollContainer =
      targetEl.closest("[data-timeline-scroll]") as HTMLDivElement | null;
    const scrollTop = scrollContainer?.scrollTop ?? 0;
    const y = event.clientY - rect.top + scrollTop;
    const rawMinutes = Math.round(y / PX_PER_MIN);
    const minutes = clamp(snapMinutes(rawMinutes, 5), 0, 1439);
    const startTime = minutesToHHMM(minutes);

    const updateSubtaskSchedule = async () => {
      if (!subtaskId || !taskId) return;
      const parentTask = timelineTasks.find((task) => task.id === taskId);
      const subtask = parentTask?.subtasks.find((item) => item.id === subtaskId);
      const estimatedMinutes = subtask?.estimated_minutes ?? 30;
      await apiFetch(`/api/tasks/${taskId}/subtasks`, {
        method: "PUT",
        body: { subtaskId, startTime, estimatedMinutes },
      });
    };

    const updateTaskSchedule = async (planId?: string) => {
      if (!taskId) return;
      await apiFetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: planId ? { dailyPlanId: planId, startTime } : { startTime },
      });
    };

    if (sourceDay === targetDay) {
      if (subtaskId) {
        await updateSubtaskSchedule();
      } else {
        await updateTaskSchedule();
      }
    } else {
      if (subtaskId) return;

      const planRes = await apiFetch<{ plan: { id: string } | null }>(
        `/api/plans?date=${targetDay}`
      );

      if (!planRes.plan) {
        await apiFetch("/api/plans", {
          method: "POST",
          body: { date: targetDay },
        });
      }

      const updatedPlanRes = await apiFetch<{ plan: { id: string } | null }>(
        `/api/plans?date=${targetDay}`
      );

      if (updatedPlanRes.plan) {
        await updateTaskSchedule(updatedPlanRes.plan.id);
      }
    }

    timelineQuery.refetch();
    window.dispatchEvent(new Event("timeline:updated"));
  };

  const handleTimelineDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleUnscheduledDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/task-id");
    const subtaskId = event.dataTransfer.getData("text/subtask-id");
    if (!taskId) return;

    if (subtaskId) {
      await apiFetch(`/api/tasks/${taskId}/subtasks`, {
        method: "PUT",
        body: { subtaskId, startTime: null },
      });
    } else {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: { startTime: null, endTime: null },
      });
    }

    timelineQuery.refetch();
    window.dispatchEvent(new Event("timeline:updated"));
  };

  return (
    <>
      {/* Detail Drawer - slides left when open */}
      <section
        className={cn(
          "absolute right-14 top-0 z-10 h-full w-[360px] border-l border-border/70 bg-card/95 shadow-card transition duration-200 ease-out",
          panelOpen
            ? "translate-x-0 opacity-100 pointer-events-auto"
            : "translate-x-full opacity-0 pointer-events-none"
        )}
        aria-hidden={!panelOpen}
      >
        <div className="flex h-14 items-center justify-between border-b border-border/70 px-4">
          <div className="flex items-center gap-2">
            <activeItem.icon className="h-4 w-4" />
            <strong className="text-sm">{activeItem.label}</strong>
          </div>
        </div>

        <div className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col overflow-auto p-4">
          {activePanel === "ideas" && (
            <div className="space-y-3">
              {showIdeas ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Capture unplanned ideas without committing them to a plan.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="px-2"
                      onClick={() => setShowAddForm((prev) => !prev)}
                    >
                      {showAddForm ? "Cancel" : "+ Task"}
                    </Button>
                  </div>
                  {showAddForm && (
                    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/50 p-3">
                      <Input
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            title: event.target.value,
                          }))
                        }
                        placeholder="New idea..."
                      />
                      <Select
                        value={draft.category}
                        onValueChange={(value) =>
                          setDraft((prev) => ({ ...prev, category: value }))
                        }
                      >
                        <SelectTrigger className="w-full bg-background">
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
                      <Button
                        size="sm"
                        onClick={() => createMutation.mutate()}
                        disabled={!draft.title.trim() || createMutation.isPending}
                      >
                        Add idea
                      </Button>
                    </div>
                  )}
                  <div className="space-y-3">
                    {sortedIdeas.map((idea) => (
                      <div key={idea.id} className="space-y-2">
                        <TaskListItem
                          task={{
                            ...idea,
                            status: "unplanned",
                            actual_minutes: null,
                            start_time: null,
                            end_time: null,
                          }}
                          day="unplanned"
                          variant="kanban"
                          draggable
                          onDragStart={(event) =>
                            handleIdeaDragStart(event, idea.id)
                          }
                          categories={categories}
                          getCategoryColor={getCategoryColor}
                          normalizeStatus={normalizeStatus}
                          formatEstimated={formatEstimated}
                          getStartTimeInput={getStartTimeInput}
                          onSaveTitle={handleTitleSave}
                          onSaveTime={handleTimeSave}
                          onSaveCategory={handleCategorySave}
                          onSaveRecurrence={handleRecurrenceSave}
                          onSetRepeatTill={handleRepeatTill}
                          onDeleteRepeat={handleDeleteRepeat}
                          dueSoonDays={dueSoonDays}
                        />
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{formatRelativeTime(idea.created_at)}</span>
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => deleteMutation.mutate(idea.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {!ideasQuery.isLoading && sortedIdeas.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No ideas mind dumped yet.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
                  <p className="text-sm text-muted-foreground">
                    Idea dump is available on Today and Plans.
                  </p>
                </div>
              )}
            </div>
          )}

          {activePanel === "timeline" && (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex-shrink-0">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {isHistoryPage && selectedKanbanDay ? "Selected Day" : "Today"}
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(`${timelineDate}T00:00:00`).toLocaleDateString(
                    "en-US",
                    { weekday: "long", month: "short", day: "numeric" }
                  )}
                </p>
              </div>
              {timelineQuery.isLoading && (
                <p className="text-sm text-muted-foreground">Loading timeline…</p>
              )}
              {!timelineQuery.isLoading && (
                <>
                  {!timelineQuery.data?.plan && (
                    <p className="text-sm text-muted-foreground">
                      No plan yet for this day.
                    </p>
                  )}
                  {timelineQuery.data?.plan && timelineTasks.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No tasks yet for this day.
                    </p>
                  )}
                  <div className="min-h-0 flex-1">
                    <TimelinePanel
                      key={`timeline-${timelineDate}-${timelineVersion}`}
                      dayKey={timelineDate}
                      tasks={timelineTasks}
                      getCategoryColor={getCategoryColor}
                      normalizeStatus={normalizeStatus}
                      isCancelledStatus={isCancelledStatus}
                      canDrag={Boolean(timelineDate)}
                      onTaskDoubleClick={(task) => {
                        setTimelineDetailTask(toDetailTask(task));
                      }}
                      onTaskDragStart={handleTimelineDragStart}
                      onSubtaskDragStart={handleSubtaskDragStart}
                      onTimelineDrop={handleTimelineDrop}
                      onTimelineDragOver={handleTimelineDragOver}
                      onUnscheduledDrop={handleUnscheduledDrop}
                        onUnscheduledDragOver={handleTimelineDragOver}
                        showUnscheduled
                        emptyMessage=""
                      />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Icon Rail - always visible */}
      <aside className="z-20 flex h-full w-14 flex-col items-center border-l border-border/70 bg-card/80">
        <div className="flex h-14 w-full items-center justify-center border-b border-border/70">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
            onClick={() => setPanelOpen((prev) => !prev)}
            title={panelOpen ? "Hide details" : "Show details"}
            aria-label="Toggle right details drawer"
          >
            {panelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex w-full flex-col items-center gap-2 p-2">
          {rightItems.map((item) => {
            const isActive = activePanel === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition",
                  isActive && panelOpen
                    ? "bg-card/60 text-foreground shadow-sm outline outline-2 outline-border/50"
                    : "hover:bg-card/40"
                )}
                title={item.label}
                onClick={() => {
                  setActivePanel(item.id);
                  setPanelOpen(true);
                }}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </nav>
      </aside>

      {timelineDetailTask && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur">
          <div className="absolute inset-0" onClick={() => setTimelineDetailTask(null)} />
          <div
            className="relative h-[85vh] w-[90vw] max-w-4xl overflow-y-auto rounded-2xl border border-border/70 bg-card p-6 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-display text-foreground">Task details</h3>
              <Button variant="ghost" size="sm" onClick={() => setTimelineDetailTask(null)}>
                Close
              </Button>
            </div>
            <TaskDetailPanel
              task={timelineDetailTask}
              categories={categories}
              getCategoryColor={getCategoryColor}
              statusLabel={statusLabel}
              statuses={statusOptions}
              priorities={priorityOptions}
              comments={[]}
              onUpdated={() => refreshTimelineAndSync(timelineDetailTask.id)}
              onDeleted={() => {
                setTimelineDetailTask(null);
                refetchTimeline();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

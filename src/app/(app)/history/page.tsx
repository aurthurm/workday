"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, RotateCcw, Plus } from "lucide-react";

type HistoryResponse = {
  plans: Array<{
    id: string;
    date: string;
    submitted: number;
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

type KanbanPlan = {
  id: string;
  date: string;
  visibility: string;
  submitted: number;
  reviewed: number;
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
};

type KanbanResponse = {
  plans: KanbanPlan[];
};

const defaultCategories = ["Admin", "Technical", "Field", "Other"];

const toDateKey = (date: Date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error("toDateKey: invalid date", date);
    return "";
  }
  return date.toISOString().slice(0, 10);
};

const parseDateKey = (value: string) => {
  if (!value || typeof value !== "string") {
    console.error("parseDateKey: invalid value", value);
    return new Date(); // Return current date as fallback
  }
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) {
    console.error("parseDateKey: invalid date string", value);
    return new Date(); // Return current date as fallback
  }
  return date;
};

const addDays = (dateKey: string, delta: number): string => {
  // Parse the date (format: YYYY-MM-DD)
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed

  // Add days
  date.setDate(date.getDate() + delta);

  // Format back to YYYY-MM-DD
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');

  return `${newYear}-${newMonth}-${newDay}`;
};

const buildDateRange = (start: string, end: string) => {
  const days: string[] = [];

  // Safety check: validate dates
  if (!start || !end) {
    console.error("buildDateRange called with invalid dates:", { start, end });
    return days;
  }

  // Safety check: ensure start <= end
  if (start > end) {
    console.error("buildDateRange: start is after end", { start, end });
    return days;
  }

  let cursor = start;
  let iterations = 0;
  const MAX_ITERATIONS = 1000; // Safety limit: ~3 years of days

  while (cursor <= end && iterations < MAX_ITERATIONS) {
    days.push(cursor);
    const next = addDays(cursor, 1);

    // Safety check: ensure we're actually advancing
    if (!next || next <= cursor) {
      console.error("buildDateRange: date not advancing", {
        cursor: cursor,
        next: next,
        cursorType: typeof cursor,
        nextType: typeof next,
        comparison: `${next} <= ${cursor}`
      });
      break;
    }

    cursor = next;
    iterations++;
  }

  if (iterations >= MAX_ITERATIONS) {
    console.error("buildDateRange: hit max iterations", { start, end, iterations });
  }

  return days;
};

export default function HistoryPage() {
  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const [view, setView] = useState<"timeline" | "kanban">("timeline");
  const [filter, setFilter] = useState<"history" | "future">("history");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedKanbanDay, setSelectedKanbanDay] = useState<string | null>(null);
  const [kanbanViewOffset, setKanbanViewOffset] = useState(0);
  const [showAddTaskForm, setShowAddTaskForm] = useState<string | null>(null);
  const [kanbanDays, setKanbanDays] = useState<string[]>(() => {
    if (!todayKey) {
      console.error("todayKey is not defined during initialization");
      return [];
    }
    const endDay = addDays(todayKey, 2);
    if (!endDay || endDay <= todayKey) {
      console.error("Invalid endDay during initialization", { todayKey, endDay });
      return [todayKey];
    }
    return buildDateRange(todayKey, endDay);
  });
  const [kanbanPlans, setKanbanPlans] = useState<
    Record<string, KanbanPlan | null>
  >({});
  const [taskDrafts, setTaskDrafts] = useState<
    Record<
      string,
      { title: string; category: string; startTime: string; estimatedMinutes: string }
    >
  >({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const kanbanScrollRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const scrollTickingRef = useRef(false);
  const lastPrevRef = useRef<string | null>(null);
  const lastNextRef = useRef<string | null>(null);
  const initialLoadRef = useRef(false);
  const { data } = useQuery({
    queryKey: ["history", filter],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/history?limit=21&filter=${filter}`),
    enabled: view === "timeline",
  });
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

  const plans = data?.plans ?? [];
  const activePlan =
    plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
  const activeTask =
    activePlan?.tasks.find((task) => task.id === selectedTaskId) ??
    activePlan?.tasks[0];

  useEffect(() => {
    if (!selectedPlanId && plans.length > 0) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  useEffect(() => {
    if (activePlan?.tasks.length && !selectedTaskId) {
      setSelectedTaskId(activePlan.tasks[0].id);
    }
  }, [activePlan?.tasks, selectedTaskId]);

  const loadRange = async (start: string, end: string) => {
    try {
      const response = await apiFetch<KanbanResponse>(
        `/api/plans/range?start=${start}&end=${end}`
      );
      const rangeDates = buildDateRange(start, end);

      setKanbanPlans((prev) => {
        const next = { ...prev };
        rangeDates.forEach((date) => {
          if (!(date in next)) {
            next[date] = null;
          }
        });
        response.plans.forEach((plan) => {
          next[plan.date] = plan;
        });
        return next;
      });
    } catch (error) {
      console.error("Failed to load range:", error);
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  };

  const extendDays = async (direction: "prev" | "next") => {
    console.log("extendDays called:", direction);

    if (loadingRef.current || kanbanDays.length === 0) {
      console.log("extendDays blocked:", { loading: loadingRef.current, daysLength: kanbanDays.length });
      return;
    }

    const extendBy = 3;
    const first = kanbanDays[0];
    const last = kanbanDays[kanbanDays.length - 1];

    // Validate dates exist
    if (!first || !last) {
      console.error("extendDays: invalid first or last date", { first, last });
      return;
    }

    // Check if we've already loaded from this boundary
    if (direction === "prev" && lastPrevRef.current === first) {
      console.log("extendDays: already loaded from this prev boundary", { first });
      return;
    }
    if (direction === "next" && lastNextRef.current === last) {
      console.log("extendDays: already loaded from this next boundary", { last });
      return;
    }

    console.log("extendDays: loading", { direction, first, last, extendBy });
    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      if (direction === "prev") {
        lastPrevRef.current = first;
        const start = addDays(first, -extendBy);
        const end = addDays(first, -1);

        // Validate the range before proceeding
        if (!start || !end || start > end) {
          console.error("extendDays prev: invalid range", { start, end, first });
          return;
        }

        const newDays = buildDateRange(start, end);
        if (newDays.length === 0) {
          console.error("extendDays prev: buildDateRange returned empty", { start, end });
          return;
        }

        console.log("extendDays prev: loading range", { start, end, newDaysCount: newDays.length });
        await loadRange(start, end);
        setKanbanDays((prev) => {
          const updated = [...newDays, ...prev];
          console.log("extendDays prev: days updated", { oldCount: prev.length, newCount: updated.length });
          return updated;
        });
      } else {
        lastNextRef.current = last;
        const start = addDays(last, 1);
        const end = addDays(last, extendBy);

        // Validate the range before proceeding
        if (!start || !end || start > end) {
          console.error("extendDays next: invalid range", { start, end, last });
          return;
        }

        const newDays = buildDateRange(start, end);
        if (newDays.length === 0) {
          console.error("extendDays next: buildDateRange returned empty", { start, end });
          return;
        }

        console.log("extendDays next: loading range", { start, end, newDaysCount: newDays.length });
        await loadRange(start, end);
        setKanbanDays((prev) => {
          const updated = [...prev, ...newDays];
          console.log("extendDays next: days updated", { oldCount: prev.length, newCount: updated.length });
          return updated;
        });
      }
    } catch (error) {
      console.error("extendDays error:", error);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (view !== "kanban") {
      initialLoadRef.current = false;
      return;
    }
    if (initialLoadRef.current) return;

    // Reset boundary refs when entering kanban view
    lastPrevRef.current = null;
    lastNextRef.current = null;

    const start = kanbanDays[0];
    const end = kanbanDays[kanbanDays.length - 1];
    if (start && end) {
      initialLoadRef.current = true;
      loadRange(start, end);

      // Auto-select the first day
      if (!selectedKanbanDay && kanbanDays.length > 0) {
        setSelectedKanbanDay(kanbanDays[0]);
      }
    }
  }, [view, kanbanDays, selectedKanbanDay]);

  const handleKanbanScroll = () => {
    if (scrollTickingRef.current || loadingRef.current) return;
    scrollTickingRef.current = true;

    requestAnimationFrame(() => {
      const container = kanbanScrollRef.current;
      if (!container) {
        scrollTickingRef.current = false;
        return;
      }

      const { scrollLeft, scrollWidth, clientWidth } = container;
      const edgeOffset = 200;
      const nearStart = scrollLeft < edgeOffset;
      const nearEnd = scrollLeft + clientWidth > scrollWidth - edgeOffset;

      scrollTickingRef.current = false;

      // Only trigger one direction at a time
      if (nearStart && !loadingRef.current) {
        extendDays("prev");
      } else if (nearEnd && !loadingRef.current) {
        extendDays("next");
      }
    });
  };

  const scrollKanbanLeft = async () => {
    // If we're at the beginning, load more previous days
    if (kanbanViewOffset === 0) {
      lastPrevRef.current = null;
      await extendDays("prev");
      // After loading 3 more days at the start, we're now at offset 0 showing the newly loaded days
    } else {
      // Just shift the view left
      setKanbanViewOffset((prev) => Math.max(0, prev - 3));
    }
  };

  const scrollKanbanRight = async () => {
    const maxOffset = Math.max(0, kanbanDays.length - 3);

    // If we're near the end, load more future days
    if (kanbanViewOffset + 3 >= kanbanDays.length) {
      lastNextRef.current = null;
      await extendDays("next");
    }

    // Shift the view right
    setKanbanViewOffset((prev) => Math.min(maxOffset + 3, prev + 3));
  };

  const resetKanbanView = async () => {
    console.log("Resetting kanban view to today");

    // Reset to initial state: today + next 2 days
    const endDay = addDays(todayKey, 2);
    if (!endDay || endDay <= todayKey) {
      console.error("Invalid endDay during reset", { todayKey, endDay });
      return;
    }

    const initialDays = buildDateRange(todayKey, endDay);
    setKanbanDays(initialDays);

    // Reset boundary refs
    lastPrevRef.current = null;
    lastNextRef.current = null;

    // Reset loading state
    loadingRef.current = false;
    setIsLoadingMore(false);

    // Reset view offset to start
    setKanbanViewOffset(0);

    // Select the first day (today)
    setSelectedKanbanDay(todayKey);

    // Load the initial range
    await loadRange(todayKey, endDay);

    console.log("Kanban view reset complete", { initialDays });
  };

  const handleAddTask = async (dateKey: string) => {
    const draft = taskDrafts[dateKey];
    if (!draft?.title.trim()) return;

    let plan = kanbanPlans[dateKey];
    if (!plan) {
      const created = await apiFetch<{ id: string }>("/api/plans", {
        method: "POST",
        body: { date: dateKey, visibility: "team" },
      });
      plan = {
        id: created.id,
        date: dateKey,
        visibility: "team",
        submitted: 0,
        reviewed: 0,
        tasks: [],
      };
      setKanbanPlans((prev) => ({ ...prev, [dateKey]: plan }));
    }

    await apiFetch("/api/tasks", {
      method: "POST",
      body: {
        dailyPlanId: plan.id,
        title: draft.title,
        category: draft.category || "Other",
        startTime: draft.startTime || null,
        estimatedMinutes: draft.estimatedMinutes
          ? Number(draft.estimatedMinutes)
          : null,
      },
    });

    setTaskDrafts((prev) => ({
      ...prev,
      [dateKey]: {
        title: "",
        category: categories[0] ?? defaultCategories[0],
        startTime: "",
        estimatedMinutes: "",
      },
    }));

    // Hide the form after adding task
    setShowAddTaskForm(null);

    await loadRange(dateKey, dateKey);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-display text-ink-900">Plans</h3>
        <p className="text-sm text-ink-600">
          Review past plans or jump ahead to future days.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {view === "timeline" && (
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as typeof filter)}
          >
            <TabsList>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="future">Future</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={view === "timeline" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("timeline")}
          >
            Timeline
          </Button>
          <Button
            variant={view === "kanban" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("kanban")}
          >
            Kanban
          </Button>
        </div>
      </div>

      {view === "timeline" && plans.length === 0 && (
        <p className="text-sm text-ink-500">
          {filter === "history"
            ? "You have no historical plans."
            : "You have no future plans."}
        </p>
      )}

      {view === "timeline" && plans.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1fr_1fr]">
        <div className="space-y-3">
          {plans.map((plan) => {
            const commentCount = plan.comments.filter(
              (comment) => !comment.task_id
            ).length;
            const isActive = plan.id === activePlan?.id;
            return (
              <button
                key={plan.id}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  isActive
                    ? "border-tide-500 bg-white shadow-lg ring-1 ring-tide-200/70"
                    : "border-ink-200/70 bg-white/80 hover:border-tide-200"
                }`}
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setSelectedTaskId(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-900">
                    {new Date(plan.date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <Badge variant="outline">
                    {plan.task_done}/{plan.task_total} done
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink-500">
                  Visibility: {plan.visibility} · Submitted:{" "}
                  {plan.submitted ? "Yes" : "No"}
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  {commentCount} plan comments
                </p>
              </button>
            );
          })}
        </div>

        {activePlan && (
          <div className="space-y-3 rounded-2xl border border-ink-200/70 bg-white/90 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Tasks for the plan
              </p>
              <Badge variant="outline">
                {activePlan.task_done}/{activePlan.task_total} done
              </Badge>
            </div>
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
                        ? `End ${new Date(task.end_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : "End -"}
                    </p>
                  )}
                </button>
              ))}
            </div>
            <div className="space-y-2 rounded-2xl border border-ink-200/70 bg-ink-50/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Plan comments
              </p>
              <div className="space-y-2">
                {activePlan.comments
                  .filter((comment) => !comment.task_id)
                  .map((note) => (
                    <Card
                      key={note.id}
                      className="rounded-lg border border-ink-200/70 bg-white px-3 py-2 text-xs"
                    >
                      <p className="text-ink-700">{note.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                        <Badge variant="outline">{note.author_name}</Badge>
                        <span>{formatRelativeTime(note.created_at)}</span>
                      </div>
                    </Card>
                  ))}
                {activePlan.comments.filter((comment) => !comment.task_id)
                  .length === 0 && (
                  <p className="text-xs text-ink-500">
                    No plan comments yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activePlan && activeTask && (
          <div className="space-y-3 rounded-2xl border border-ink-200/70 bg-white/90 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Task detail
              </p>
              <span className="status-pill" data-status={activeTask.status}>
                {activeTask.status}
              </span>
            </div>
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
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Task comments
              </p>
              <div className="space-y-2">
                {activePlan.comments
                  .filter((comment) => comment.task_id === activeTask.id)
                  .map((note) => (
                    <Card
                      key={note.id}
                      className="rounded-lg border border-ink-200/70 bg-ink-50/70 px-3 py-2 text-xs"
                    >
                      <p className="text-ink-700">{note.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-500">
                        <Badge variant="outline">{note.author_name}</Badge>
                        <span>{formatRelativeTime(note.created_at)}</span>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          </div>
        )}
        </div>
      )}

      {view === "kanban" && (
        <div className="space-y-6">
          {isLoadingMore && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-ink-200/70 bg-white/90 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-tide-500 border-t-transparent" />
              <p className="text-sm text-ink-600">Loading more days...</p>
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={scrollKanbanLeft}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetKanbanView}
              className="flex items-center gap-2"
              title="Reset to today"
            >
              <RotateCcw className="h-4 w-4" />
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={scrollKanbanRight}
              className="flex items-center gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-[repeat(3,280px)_1fr] gap-3">
            {kanbanDays.slice(kanbanViewOffset, kanbanViewOffset + 3).map((day) => {
                const plan = kanbanPlans[day];
              const draft = taskDrafts[day] ?? {
                title: "",
                category: categories[0] ?? defaultCategories[0],
                startTime: "",
                estimatedMinutes: "",
              };
                const hasPlan = Boolean(plan);
                const isSelected = selectedKanbanDay === day;
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedKanbanDay(day)}
                    className={`cursor-pointer rounded-3xl border px-3 py-4 shadow-sm transition ${
                      isSelected
                        ? "border-tide-500 bg-tide-50 ring-2 ring-tide-200"
                        : hasPlan
                        ? "border-tide-300 bg-white hover:border-tide-400"
                        : "border-dashed border-ink-300 bg-ink-50/60 hover:border-ink-400"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                              {day === todayKey ? "Today" : "Day"}
                            </p>
                            {hasPlan ? (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">
                                {plan?.tasks.length ?? 0} tasks
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] h-4 px-1">No plan yet</Badge>
                            )}
                          </div>
                          <p className="text-base font-medium text-ink-900 mt-0.5">
                            {new Date(`${day}T00:00:00`).toLocaleDateString(
                              "en-US",
                              { weekday: "short", month: "short", day: "numeric" }
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAddTaskForm(showAddTaskForm === day ? null : day);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {showAddTaskForm === day && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-ink-200/70 bg-white/70 p-3">
                      <Input
                        className="min-w-[160px] flex-1"
                        placeholder="Add a task"
                        value={draft.title}
                        onChange={(event) =>
                          setTaskDrafts((prev) => ({
                            ...prev,
                            [day]: {
                              ...draft,
                              title: event.target.value,
                            },
                          }))
                        }
                      />
                    <Select
                      value={draft.category}
                        onValueChange={(value) =>
                          setTaskDrafts((prev) => ({
                            ...prev,
                            [day]: { ...draft, category: value },
                          }))
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
                      className="w-[110px]"
                      placeholder="Est."
                      value={draft.estimatedMinutes}
                      onChange={(event) =>
                        setTaskDrafts((prev) => ({
                          ...prev,
                          [day]: {
                            ...draft,
                            estimatedMinutes: event.target.value,
                          },
                        }))
                      }
                    />
                    <Input
                      type="time"
                      className="w-[120px]"
                      value={draft.startTime}
                        onChange={(event) =>
                          setTaskDrafts((prev) => ({
                            ...prev,
                            [day]: { ...draft, startTime: event.target.value },
                          }))
                        }
                      />
                      <Button
                        onClick={() => handleAddTask(day)}
                        disabled={!draft.title.trim()}
                      >
                        Add task
                      </Button>
                    </div>
                    )}

                    <div className="mt-3 space-y-2">
                      {plan?.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-2xl border border-ink-200/70 bg-white p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-ink-900">
                              {task.title}
                            </p>
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
                        </div>
                      ))}
                      {plan?.tasks.length === 0 && (
                        <p className="text-sm text-ink-500">
                          No tasks yet for this day.
                        </p>
                      )}
                      {!plan && (
                        <p className="text-sm text-ink-500">
                          No plan yet for this day.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

            {/* 24-Hour Timeline Column */}
            <div className="rounded-3xl border border-ink-200/70 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                  24-Hour Timeline
                </p>
                {selectedKanbanDay && (
                  <p className="text-lg font-medium text-ink-900">
                    {new Date(`${selectedKanbanDay}T00:00:00`).toLocaleDateString(
                      "en-US",
                      { weekday: "long", month: "short", day: "numeric" }
                    )}
                  </p>
                )}
                {!selectedKanbanDay && (
                  <p className="text-sm text-ink-500">
                    Select a day to view timeline
                  </p>
                )}
              </div>

              {selectedKanbanDay && (
                <div className="relative h-[600px] overflow-y-auto">
                  {/* Unscheduled tasks section */}
                  {(() => {
                    const selectedPlan = kanbanPlans[selectedKanbanDay];
                    const allTasks = selectedPlan?.tasks || [];
                    const unscheduledTasks = allTasks.filter(task => !task.start_time);

                    if (unscheduledTasks.length > 0) {
                      return (
                        <div className="mb-3 rounded-lg border border-ink-200/70 bg-ink-50/40 p-3">
                          <p className="mb-2 text-xs font-medium text-ink-600">Unscheduled</p>
                          <div className="space-y-1">
                            {unscheduledTasks.map((task) => (
                              <div
                                key={task.id}
                                className={`rounded-lg border px-2 py-1.5 text-xs ${
                                  task.status === "done"
                                    ? "border-green-300 bg-green-50 text-green-900"
                                    : task.status === "skipped"
                                    ? "border-gray-300 bg-gray-50 text-gray-600"
                                    : "border-tide-300 bg-tide-50 text-tide-900"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{task.title}</span>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    {task.status}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 text-[10px] text-ink-500">
                                  {task.category} · {task.estimated_minutes ?? "—"} min
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Hour markers */}
                  <div className="space-y-0">
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i;
                      const hourLabel = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                      const selectedPlan = kanbanPlans[selectedKanbanDay];
                      const allTasks = selectedPlan?.tasks || [];

                      // Filter tasks that start in this hour
                      const tasksAtHour = allTasks.filter(task => {
                        if (!task.start_time) return false;
                        const startDate = new Date(task.start_time);
                        return startDate.getHours() === hour;
                      });

                      return (
                        <div key={hour} className="relative border-t border-ink-200/50 py-2">
                          <div className="flex items-start gap-3">
                            <span className="w-16 text-xs font-medium text-ink-500">
                              {hourLabel}
                            </span>
                            <div className="flex-1 space-y-1">
                              {tasksAtHour.map((task) => {
                                const startTime = task.start_time ? new Date(task.start_time) : null;
                                const endTime = task.end_time ? new Date(task.end_time) : null;

                                // Calculate end time if not provided
                                const calculatedEndTime = endTime || (startTime && task.estimated_minutes
                                  ? new Date(startTime.getTime() + task.estimated_minutes * 60000)
                                  : null);

                                const duration = calculatedEndTime && startTime
                                  ? Math.round((calculatedEndTime.getTime() - startTime.getTime()) / 60000)
                                  : task.estimated_minutes || 0;

                                return (
                                  <div
                                    key={task.id}
                                    className={`rounded-lg border px-2 py-1.5 text-xs ${
                                      task.status === "done"
                                        ? "border-green-300 bg-green-50 text-green-900"
                                        : task.status === "skipped"
                                        ? "border-gray-300 bg-gray-50 text-gray-600"
                                        : "border-tide-300 bg-tide-50 text-tide-900"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{task.title}</span>
                                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                                        {task.status}
                                      </Badge>
                                    </div>
                                    <p className="mt-0.5 text-[10px] text-ink-500">
                                      {startTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      {calculatedEndTime && ` - ${calculatedEndTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                      {duration > 0 && ` (${duration} min)`}
                                    </p>
                                    <p className="mt-0.5 text-[10px] text-ink-500">
                                      {task.category}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!selectedKanbanDay && (
                <div className="flex h-[600px] items-center justify-center">
                  <p className="text-sm text-ink-400">
                    Click on a day card to view its timeline
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

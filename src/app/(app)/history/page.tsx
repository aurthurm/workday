"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
import { TaskListItem } from "@/components/task-list-item";
import { TaskDetailPanel } from "@/components/task-detail-panel";

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
      status: "planned" | "done" | "skipped" | "cancelled";
      estimated_minutes: number | null;
      actual_minutes: number | null;
      notes: string | null;
      priority: "high" | "medium" | "low" | "none";
      due_date: string | null;
      recurrence_rule: string | null;
      recurrence_time: string | null;
      repeat_till: string | null;
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
    status: "planned" | "done" | "skipped" | "cancelled";
    estimated_minutes: number | null;
    actual_minutes: number | null;
    due_date: string | null;
    recurrence_rule: string | null;
    repeat_till: string | null;
    start_time: string | null;
    end_time: string | null;
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
};

type KanbanResponse = {
  plans: KanbanPlan[];
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
const filterTasks = <T extends { status: string; category: string }>(
  tasks: T[],
  statusFilter: string,
  categoryFilter: string
) =>
  tasks.filter((task) => {
    const normalized = normalizeStatus(task.status);
    const matchesStatus = statusFilter === "all" || normalized === statusFilter;
    const matchesCategory =
      categoryFilter === "all" || task.category === categoryFilter;
    return matchesStatus && matchesCategory;
  });

const toDateKey = (date: Date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error("toDateKey: invalid date", date);
    return "";
  }
  return date.toISOString().slice(0, 10);
};
const statusLabel = (status: string) => normalizeStatus(status);
const statuses = ["planned", "done", "cancelled", "unplanned"] as const;
const priorities = ["none", "low", "medium", "high"] as const;

const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

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
  const [view, setView] = useState<"listview" | "kanban">("listview");
  const [filter, setFilter] = useState<"history" | "future">("history");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedKanbanDay, setSelectedKanbanDay] = useState<string | null>(null);
  const [kanbanViewOffset, setKanbanViewOffset] = useState(0);
  const [showAddTaskForm, setShowAddTaskForm] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [kanbanDays, setKanbanDays] = useState<string[]>(() => {
    if (!todayKey) {
      console.error("todayKey is not defined during initialization");
      return [];
    }
    const endDay = addDays(todayKey, 4);
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
  const historyQuery = useQuery({
    queryKey: ["history", filter],
    queryFn: () =>
      apiFetch<HistoryResponse>(`/api/history?limit=21&filter=${filter}`),
    enabled: view === "listview",
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      apiFetch<{ settings: { due_soon_days: number; task_add_position: string; default_est_minutes: number } }>(
        "/api/settings"
      ),
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspacesResponse>("/api/workspaces"),
  });
  const activeWorkspaceId = workspacesQuery.data?.activeWorkspaceId ?? "none";
  const dueSoonDays = settingsQuery.data?.settings.due_soon_days ?? 3;
  const taskAddPosition = settingsQuery.data?.settings.task_add_position ?? "bottom";
  const defaultEstMinutes = settingsQuery.data?.settings.default_est_minutes ?? 15;
  const categoriesQuery = useQuery({
    queryKey: ["categories", activeWorkspaceId],
    queryFn: () =>
      apiFetch<{
        categories: Array<{ id: string; name: string; color: string }>;
      }>("/api/categories"),
  });
  const categoryList = categoriesQuery.data?.categories ?? defaultCategories;
  const categories = categoryList.map((category) => category.name);
  const categoryColors = useMemo(
    () =>
      new Map(
        categoryList.map((category) => [category.name, category.color] as const)
      ),
    [categoryList]
  );
  const getCategoryColor = (name: string) =>
    categoryColors.get(name) ?? "#64748b";

  const plans = historyQuery.data?.plans ?? [];
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

  useEffect(() => {
    if (view === "kanban" && selectedKanbanDay) {
      window.dispatchEvent(
        new CustomEvent("kanban:daySelected", { detail: { day: selectedKanbanDay } })
      );
    }
  }, [view, selectedKanbanDay]);

  const loadRange = async (start: string, end: string) => {
    try {
      if (!isDateKey(start) || !isDateKey(end)) {
        return;
      }
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

  useEffect(() => {
    const handlePlansUpdated = () => {
      if (view === "listview") {
        historyQuery.refetch();
        return;
      }
      if (view === "kanban" && selectedKanbanDay) {
        loadRange(selectedKanbanDay, selectedKanbanDay);
      }
    };
    window.addEventListener("plans:updated", handlePlansUpdated);
    return () => window.removeEventListener("plans:updated", handlePlansUpdated);
  }, [historyQuery, loadRange, selectedKanbanDay, view]);

  const extendDays = async (direction: "prev" | "next") => {
    console.log("extendDays called:", direction);

    if (loadingRef.current || kanbanDays.length === 0) {
      console.log("extendDays blocked:", { loading: loadingRef.current, daysLength: kanbanDays.length });
      return;
    }

    const extendBy = 5;
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
      // After loading 5 more days at the start, we're now at offset 0 showing the newly loaded days
    } else {
      // Just shift the view left
      setKanbanViewOffset((prev) => Math.max(0, prev - 5));
    }
  };

  const scrollKanbanRight = async () => {
    const maxOffset = Math.max(0, kanbanDays.length - 5);

    // If we're near the end, load more future days
    if (kanbanViewOffset + 5 >= kanbanDays.length) {
      lastNextRef.current = null;
      await extendDays("next");
    }

    // Shift the view right
    setKanbanViewOffset((prev) => Math.min(maxOffset + 5, prev + 5));
  };

  const resetKanbanView = async () => {
    console.log("Resetting kanban view to today");

    // Reset to initial state: today + next 4 days
    const endDay = addDays(todayKey, 4);
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
        position: taskAddPosition === "top" ? 0 : undefined,
      },
    });

    setTaskDrafts((prev) => ({
      ...prev,
      [dateKey]: {
        title: "",
        category: categories[0] ?? defaultCategories[0]?.name ?? "Other",
        startTime: "",
        estimatedMinutes: String(defaultEstMinutes),
      },
    }));

    // Hide the form after adding task
    setShowAddTaskForm(null);

    await loadRange(dateKey, dateKey);
  };

  const handleTitleSave = async (
    taskId: string,
    day: string,
    nextTitle: string
  ) => {
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { title: trimmed },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
  };

  const handleTimeSave = async (
    taskId: string,
    day: string,
    startTime: string,
    estimatedMinutes: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: {
        startTime: startTime || null,
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
      },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
    window.dispatchEvent(new Event("timeline:updated"));
  };

  const handleCategorySave = async (
    taskId: string,
    day: string,
    category: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { category },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
  };

  const handleRecurrenceSave = async (
    taskId: string,
    day: string,
    recurrenceRule: string | null
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { recurrenceRule },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
  };

  const handleRepeatTill = async (
    taskId: string,
    day: string,
    repeatTill: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { repeatTill },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
  };

  const handleDeleteRepeat = async (taskId: string, day: string) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { recurrenceRule: null },
    });
    if (view === "kanban") {
      await loadRange(day, day);
    } else {
      await historyQuery.refetch();
    }
  };

  const getStartTimeInput = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";
  const formatEstimated = (minutes: number | null) => {
    if (!minutes || minutes <= 0) return "0.00";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}.${String(mins).padStart(2, "0")}`;
  };

  const isDraggableDay = (day: string) => day >= todayKey;
  const canDragDayTasks = (day: string | null) =>
    Boolean(day) && isDraggableDay(day ?? "") && selectedKanbanDay === day;

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    sourceDay: string
  ) => {
    if (!isDraggableDay(sourceDay)) return;
    event.dataTransfer.setData("text/task-id", taskId);
    event.dataTransfer.setData("text/source-day", sourceDay);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, day: string) => {
    event.preventDefault();
    if (!isDraggableDay(day)) return;
    const taskId = event.dataTransfer.getData("text/task-id");
    const subtaskId = event.dataTransfer.getData("text/subtask-id");
    const sourceDay = event.dataTransfer.getData("text/source-day");
    if ((!taskId && !subtaskId) || !sourceDay) return;

    if (sourceDay === day) {
      if (subtaskId && taskId) {
        await apiFetch(`/api/tasks/${taskId}/subtasks`, {
          method: "PUT",
          body: { subtaskId, startTime: null },
        });
        await loadRange(day, day);
        window.dispatchEvent(new Event("timeline:updated"));
      } else if (taskId) {
        await apiFetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          body: { startTime: null },
        });
        await loadRange(day, day);
        window.dispatchEvent(new Event("timeline:updated"));
      }
      return;
    }

    if (subtaskId) return;

    let targetPlan = kanbanPlans[day];
    if (!targetPlan) {
      const created = await apiFetch<{ id: string }>("/api/plans", {
        method: "POST",
        body: { date: day, visibility: "team" },
      });
      targetPlan = {
        id: created.id,
        date: day,
        visibility: "team",
        submitted: 0,
        reviewed: 0,
        tasks: [],
      };
      setKanbanPlans((prev) => ({ ...prev, [day]: targetPlan }));
    }

    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { dailyPlanId: targetPlan.id },
    });

    window.dispatchEvent(new Event("ideas:updated"));

    if (isDateKey(sourceDay)) {
      await Promise.all([loadRange(sourceDay, sourceDay), loadRange(day, day)]);
    } else {
      await loadRange(day, day);
    }
    window.dispatchEvent(new Event("timeline:updated"));
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-display text-foreground">Plans</h3>
          <p className="text-sm text-muted-foreground">
            Review past plans or jump ahead to future days.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value)}
          >
            <SelectTrigger className="w-[170px] bg-card">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
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
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value)}
          >
            <SelectTrigger className="w-[150px] bg-card">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="planned">planned</SelectItem>
              <SelectItem value="done">done</SelectItem>
              <SelectItem value="cancelled">cancelled</SelectItem>
            </SelectContent>
          </Select>
        {view === "listview" ? (
          <Tabs
            value={filter}
            onValueChange={(value) => setFilter(value as typeof filter)}
          >
            <TabsList>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="future">Future</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div className="flex items-center gap-2">
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
        )}
          <div className="flex items-center gap-2">
            <Button
              variant={view === "listview" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("listview")}
            >
              List view
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
      </div>

      {view === "listview" && plans.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {filter === "history"
            ? "You have no historical plans."
            : "You have no future plans."}
        </p>
      )}

      {view === "listview" && plans.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[0.6fr_0.85fr_1.2fr]">
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
                    ? "border-tide-500 bg-card shadow-lg ring-1 ring-tide-200/70"
                    : "border-border/70 bg-card/80 hover:border-tide-200"
                }`}
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setSelectedTaskId(null);
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Visibility: {plan.visibility} · Submitted:{" "}
                  {plan.submitted ? "Yes" : "No"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {commentCount} plan comments
                </p>
              </button>
            );
          })}
        </div>

        {activePlan && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Tasks for the plan
              </p>
              <Badge variant="outline">
                {activePlan.task_done}/{activePlan.task_total} done
              </Badge>
            </div>
            <div className="space-y-2">
              {filterTasks(activePlan.tasks, statusFilter, categoryFilter).map(
                (task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    day={activePlan.date}
                    variant="list"
                    isSelected={task.id === activeTask?.id}
                    onSelect={() => setSelectedTaskId(task.id)}
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
                )
              )}
              {filterTasks(activePlan.tasks, statusFilter, categoryFilter).length ===
                0 && (
                <p className="text-sm text-muted-foreground">
                  No tasks match the selected filters.
                </p>
              )}
            </div>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/60 p-3">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Plan comments
              </p>
              <div className="space-y-2">
                {activePlan.comments
                  .filter((comment) => !comment.task_id)
                  .map((note) => (
                    <Card
                      key={note.id}
                      className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
                    >
                      <p className="text-muted-foreground">{note.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline">{note.author_name}</Badge>
                        <span>{formatRelativeTime(note.created_at)}</span>
                      </div>
                    </Card>
                  ))}
                {activePlan.comments.filter((comment) => !comment.task_id)
                  .length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No plan comments yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {activePlan && activeTask && (
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4">
            <TaskDetailPanel
              task={activeTask}
              categories={categories}
              getCategoryColor={getCategoryColor}
              statusLabel={statusLabel}
              statuses={statuses}
              priorities={priorities}
              comments={activePlan.comments}
              onUpdated={() => historyQuery.refetch()}
              onDeleted={() => historyQuery.refetch()}
            />
          </div>
        )}
        </div>
      )}

      {view === "kanban" && (
        <div className="space-y-6">
          {isLoadingMore && (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card/90 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-tide-500 border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading more days...</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {kanbanDays.slice(kanbanViewOffset, kanbanViewOffset + 5).map((day) => {
                const plan = kanbanPlans[day];
              const draft = taskDrafts[day] ?? {
                title: "",
                category: categories[0] ?? defaultCategories[0]?.name ?? "Other",
                startTime: "",
                estimatedMinutes: String(defaultEstMinutes),
              };
                const hasPlan = Boolean(plan);
                const isSelected = selectedKanbanDay === day;
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedKanbanDay(day)}
                    onDragOver={(event) => {
                      if (isDraggableDay(day)) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => handleDrop(event, day)}
                    className={`cursor-pointer rounded-3xl border px-3 py-4 shadow-sm transition ${
                      isSelected
                        ? "border-tide-500 bg-tide-50 ring-2 ring-tide-200"
                        : hasPlan
                        ? "border-tide-300 bg-card hover:border-tide-400"
                        : "border-dashed border-border bg-muted/60 hover:border-border"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
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
                          <p className="text-base font-medium text-foreground mt-0.5">
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
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
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

                    <div
                      className="mt-3 space-y-2"
                      onDragOver={(event) => {
                        if (isDraggableDay(day)) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={(event) => handleDrop(event, day)}
                    >
                      {filterTasks(plan?.tasks ?? [], statusFilter, categoryFilter).map(
                        (task) => (
                        <TaskListItem
                          key={task.id}
                          task={task}
                          day={day}
                          draggable={canDragDayTasks(day)}
                          onDragStart={(event) => handleDragStart(event, task.id, day)}
                          variant="kanban"
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
                        )
                      )}
                      {plan?.tasks.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No tasks yet for this day.
                        </p>
                      )}
                      {plan?.tasks.length !== 0 &&
                        filterTasks(
                          plan?.tasks ?? [],
                          statusFilter,
                          categoryFilter
                        ).length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No tasks match the selected filters.
                          </p>
                        )}
                      {!plan && (
                        <p className="text-sm text-muted-foreground">
                          No plan yet for this day.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

          </div>
        </div>
      )}
    </div>
  );
}

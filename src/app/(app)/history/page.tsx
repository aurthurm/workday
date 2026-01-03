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
      due_date: string | null;
      recurrence_rule: string | null;
      repeat_till: string | null;
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
const MINUTES_IN_DAY = 1440;
const PX_PER_MIN = 1;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const toMinutesFromMidnight = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();
const minutesToHHMM = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};
const snapMinutes = (minutes: number, snap = 5) =>
  Math.round(minutes / snap) * snap;
const getTaskDurationMinutes = (task: {
  start_time: string | null;
  end_time: string | null;
  estimated_minutes: number | null;
}) => {
  if (!task.start_time) return 0;
  const start = new Date(task.start_time);
  if (task.end_time) {
    const end = new Date(task.end_time);
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
  }
  if (task.estimated_minutes) return Math.max(1, task.estimated_minutes);
  return 15;
};
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
  const dueSoonDays = settingsQuery.data?.settings.due_soon_days ?? 3;
  const taskAddPosition = settingsQuery.data?.settings.task_add_position ?? "bottom";
  const defaultEstMinutes = settingsQuery.data?.settings.default_est_minutes ?? 15;
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
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

  const updateSubtaskSchedule = async (
    taskId: string,
    subtaskId: string,
    day: string,
    minutes: number
  ) => {
    const plan = kanbanPlans[day];
    const parentTask = plan?.tasks.find((task) => task.id === taskId);
    const subtask = parentTask?.subtasks.find((item) => item.id === subtaskId);
    const estimatedMinutes = subtask?.estimated_minutes ?? 30;
    const startTime = minutesToHHMM(minutes);
    await apiFetch(`/api/tasks/${taskId}/subtasks`, {
      method: "PUT",
      body: { subtaskId, startTime, estimatedMinutes },
    });
    await loadRange(day, day);
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
      } else if (taskId) {
        await apiFetch(`/api/tasks/${taskId}`, {
          method: "PUT",
          body: { startTime: null },
        });
        await loadRange(day, day);
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
  };

  const handleTimelineDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!selectedKanbanDay || !isDraggableDay(selectedKanbanDay)) return;
    const taskId = event.dataTransfer.getData("text/task-id");
    const subtaskId = event.dataTransfer.getData("text/subtask-id");
    const sourceDay = event.dataTransfer.getData("text/source-day");
    if ((!taskId && !subtaskId) || !sourceDay || sourceDay !== selectedKanbanDay) {
      return;
    }

    const el = event.currentTarget as HTMLDivElement;
    const rect = el.getBoundingClientRect();
    const y = event.clientY - rect.top + el.scrollTop;
    const rawMinutes = Math.round(y / PX_PER_MIN);
    const minutes = clamp(snapMinutes(rawMinutes, 5), 0, 1439);
    const startTime = minutesToHHMM(minutes);

    if (subtaskId && taskId) {
      await updateSubtaskSchedule(taskId, subtaskId, selectedKanbanDay, minutes);
      return;
    }
    if (taskId) {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        body: { startTime },
      });
      await loadRange(selectedKanbanDay, selectedKanbanDay);
    }
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
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Task detail
              </p>
              <span className="status-pill" data-status={normalizeStatus(activeTask.status)}>
                {normalizeStatus(activeTask.status)}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-base font-medium text-foreground">
                  {activeTask.title}
                </p>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: getCategoryColor(activeTask.category),
                    }}
                  />
                  {activeTask.category} · est{" "}
                  {activeTask.estimated_minutes ?? "-"} / actual{" "}
                  {activeTask.actual_minutes ?? "-"}
                </p>
                {(activeTask.start_time || activeTask.end_time) && (
                  <p className="text-xs text-muted-foreground">
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
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Task comments
              </p>
              <div className="space-y-2">
                {activePlan.comments
                  .filter((comment) => comment.task_id === activeTask.id)
                  .map((note) => (
                    <Card
                      key={note.id}
                      className="rounded-lg border border-border/70 bg-muted/70 px-3 py-2 text-xs"
                    >
                      <p className="text-muted-foreground">{note.content}</p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
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
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border/70 bg-card/90 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-tide-500 border-t-transparent" />
              <p className="text-sm text-muted-foreground">Loading more days...</p>
            </div>
          )}
          <div className="grid grid-cols-[repeat(3,280px)_1fr] gap-3">
            {kanbanDays.slice(kanbanViewOffset, kanbanViewOffset + 3).map((day) => {
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

            {/* 24-Hour Timeline Column */}
            <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  24-Hour Timeline
                </p>
                {selectedKanbanDay && (
                  <p className="text-lg font-medium text-foreground">
                    {new Date(`${selectedKanbanDay}T00:00:00`).toLocaleDateString(
                      "en-US",
                      { weekday: "long", month: "short", day: "numeric" }
                    )}
                  </p>
                )}
                {!selectedKanbanDay && (
                  <p className="text-sm text-muted-foreground">
                    Select a day to view timeline
                  </p>
                )}
              </div>

              {selectedKanbanDay && (
                <div className="relative h-[600px] overflow-y-auto scrollbar-thin">
                  {/* Unscheduled tasks section */}
                  {(() => {
                    const selectedPlan = kanbanPlans[selectedKanbanDay];
                    const allTasks = selectedPlan?.tasks || [];
                    const unscheduledTasks = allTasks.filter(task => !task.start_time);

                    if (unscheduledTasks.length > 0) {
                      return (
                        <div className="mb-3 rounded-lg border border-border/70 bg-muted/40 p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">Unscheduled</p>
                          <div className="space-y-1">
                            {unscheduledTasks.map((task) => (
                              <div
                                key={task.id}
                                draggable={canDragDayTasks(selectedKanbanDay)}
                                onDragStart={(event) => {
                                  if (!selectedKanbanDay) return;
                                  handleDragStart(event, task.id, selectedKanbanDay);
                                }}
                                className={`rounded-lg border px-2 py-1.5 text-xs ${
                                  task.status === "done"
                                    ? "border-green-300 bg-green-50 text-green-900"
                                    : isCancelledStatus(task.status)
                                    ? "border-gray-300 bg-gray-50 text-gray-600"
                                    : "border-tide-300 bg-tide-50 text-tide-900"
                                } ${
                                  canDragDayTasks(selectedKanbanDay)
                                    ? "cursor-grab active:cursor-grabbing"
                                    : "cursor-not-allowed opacity-80"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{task.title}</span>
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    {normalizeStatus(task.status)}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  <span className="inline-flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{
                                        backgroundColor: getCategoryColor(task.category),
                                      }}
                                    />
                                    {task.category} · {task.estimated_minutes ?? "—"} min
                                  </span>
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {(() => {
                    const selectedPlan = kanbanPlans[selectedKanbanDay];
                    const allTasks = selectedPlan?.tasks || [];
                    const allSubtasks = allTasks.flatMap((task) =>
                      task.subtasks.map((subtask) => ({ subtask, parentTask: task }))
                    );
                    const scheduledTasks = allTasks
                      .filter((task) => task.start_time)
                      .map((task) => {
                        const start = new Date(task.start_time!);
                        const startMins = toMinutesFromMidnight(start);
                        const duration = getTaskDurationMinutes(task);
                        const top = startMins * PX_PER_MIN;
                        const height = duration * PX_PER_MIN;
                        return {
                          kind: "task" as const,
                          task,
                          top,
                          height,
                          startMins,
                          duration,
                        };
                      });
                    const scheduledSubtasks = allSubtasks
                      .filter((item) => item.subtask.start_time)
                      .map((item) => {
                        const start = new Date(item.subtask.start_time!);
                        const startMins = toMinutesFromMidnight(start);
                        const duration = item.subtask.end_time
                          ? Math.max(
                              1,
                              Math.round(
                                (new Date(item.subtask.end_time).getTime() -
                                  start.getTime()) /
                                  60000
                              )
                            )
                          : item.subtask.estimated_minutes ?? 30;
                        const top = startMins * PX_PER_MIN;
                        const height = duration * PX_PER_MIN;
                        return {
                          kind: "subtask" as const,
                          subtask: item.subtask,
                          parentTask: item.parentTask,
                          top,
                          height,
                          startMins,
                          duration,
                        };
                      });
                    const scheduledItems = [...scheduledTasks, ...scheduledSubtasks].sort(
                      (a, b) => a.top - b.top
                    );
                    const timelineHeight = MINUTES_IN_DAY * PX_PER_MIN;

                    return (
                      <div className="relative h-[600px]">
                        <div
                          className="relative w-full"
                          style={{ height: timelineHeight }}
                          onDragOver={(event) => {
                            if (selectedKanbanDay && isDraggableDay(selectedKanbanDay)) {
                              event.preventDefault();
                            }
                          }}
                          onDrop={handleTimelineDrop}
                        >
                          {Array.from({ length: 24 }, (_, hour) => {
                            const top = hour * 60 * PX_PER_MIN;
                            const label =
                              hour === 0
                                ? "12 AM"
                                : hour < 12
                                ? `${hour} AM`
                                : hour === 12
                                ? "12 PM"
                                : `${hour - 12} PM`;

                            return (
                              <div
                                key={hour}
                                className="absolute left-0 right-0 border-t border-border/50"
                                style={{ top }}
                              >
                                <div className="flex items-start gap-3">
                                  {/* minimum height of 60px */}
                                  <span className="w-16 pr-1 text-xs font-medium text-muted-foreground text-right border-r min-h-[60px] border-border/50">
                                    {label}
                                  </span>
                                  <div className="flex-1" />
                                </div>
                              </div>
                            );
                          })}

                          {scheduledItems.map((item) => {
                            if (item.kind === "task") {
                              const task = item.task;
                              return (
                                <div
                                  key={task.id}
                                  draggable={canDragDayTasks(selectedKanbanDay)}
                                  onDragStart={(event) => {
                                    if (!selectedKanbanDay) return;
                                    handleDragStart(event, task.id, selectedKanbanDay);
                                  }}
                                  className={`absolute left-[64px] right-1 border p-1 text-xs text-foreground shadow-sm ${
                                    task.status === "done"
                                      ? "border-green-300"
                                      : isCancelledStatus(task.status)
                                      ? "border-gray-300"
                                      : "border-tide-300"
                                  } ${
                                    canDragDayTasks(selectedKanbanDay)
                                      ? "cursor-grab active:cursor-grabbing"
                                      : "cursor-not-allowed"
                                  }`}
                                  style={{
                                    top: item.top,
                                    height: Math.max(30, item.height),
                                    backgroundColor: getCategoryColor(task.category),
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">{task.title}</span>
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {minutesToHHMM(item.startMins)} -{" "}
                                    {minutesToHHMM(item.startMins + item.duration)}
                                  </p>
                                </div>
                              );
                            }
                            const subtask = item.subtask;
                            const borderColor = getCategoryColor(item.parentTask.category);
                            const parentStatus = item.parentTask.status;
                            return (
                              <div
                                key={subtask.id}
                                draggable={canDragDayTasks(selectedKanbanDay)}
                                onDragStart={(event) => {
                                  if (!selectedKanbanDay) return;
                                  event.dataTransfer.setData("text/subtask-id", subtask.id);
                                  event.dataTransfer.setData("text/task-id", item.parentTask.id);
                                  event.dataTransfer.setData("text/source-day", selectedKanbanDay);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                className={`absolute left-[82px] right-4 border-l-4 border px-2 py-1 text-[11px] shadow-sm ${
                                  parentStatus === "done"
                                    ? "border-green-300 bg-green-50 text-green-900"
                                    : isCancelledStatus(parentStatus)
                                    ? "border-gray-300 bg-gray-50 text-gray-600"
                                    : "border-border/70 bg-card text-foreground"
                                } ${
                                  canDragDayTasks(selectedKanbanDay)
                                    ? "cursor-grab active:cursor-grabbing"
                                    : "cursor-not-allowed"
                                }`}
                                style={{
                                  top: item.top,
                                  height: Math.max(30, item.height),
                                  borderLeftColor: borderColor,
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{subtask.title}</span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {minutesToHHMM(item.startMins)} -{" "}
                                  {minutesToHHMM(item.startMins + item.duration)} · est{" "}
                                  {subtask.estimated_minutes ?? "—"} · act{" "}
                                  {subtask.actual_minutes ?? "—"}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {!selectedKanbanDay && (
                <div className="flex h-[600px] items-center justify-center">
                  <p className="text-sm text-muted-foreground">
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

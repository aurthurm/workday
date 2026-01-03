"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Lightbulb } from "lucide-react";

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

const defaultCategories = [
  { name: "Admin", color: "#2563eb" },
  { name: "Technical", color: "#0f766e" },
  { name: "Field", color: "#16a34a" },
  { name: "Other", color: "#64748b" },
];
const normalizeStatus = (status: string) =>
  status === "skipped" ? "cancelled" : status;
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

export function RightRail() {
  const pathname = usePathname();
  const showIdeas = pathname === "/today" || pathname === "/history";
  const [panelOpen, setPanelOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: defaultCategories[0].name,
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
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      apiFetch<{ settings: { due_soon_days: number } }>("/api/settings"),
    enabled: showIdeas,
  });
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
    setDraft((prev) => {
      if (categories.length === 0) return prev;
      if (categories.includes(prev.category)) {
        return prev;
      }
      return { ...prev, category: categories[0] };
    });
  }, [categories]);

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

  return (
    <>
      {/* Detail Drawer - slides left when open */}
      <section
        className={cn(
          "absolute right-14 top-0 z-10 h-full w-48 border-l border-border/70 bg-card/95 shadow-card transition-transform duration-200 ease-out",
          panelOpen
            ? "translate-x-0 pointer-events-auto visible"
            : "translate-x-full pointer-events-none invisible"
        )}
        aria-hidden={!panelOpen}
      >
        <div className="flex h-14 items-center justify-between border-b border-border/70 px-4">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            <strong className="text-sm">Idea Dump</strong>
          </div>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground"
            onClick={() => setPanelOpen(false)}
            title="Close panel"
            aria-label="Close right detail panel"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="h-[calc(100%-3.5rem)] overflow-auto p-4">
          <div className="space-y-3">
            {showIdeas && (
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
                                style={{ backgroundColor: getCategoryColor(category) }}
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
                        onDragStart={(event) => handleIdeaDragStart(event, idea.id)}
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
            )}
            {!showIdeas && (
              <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
                <p className="text-sm text-muted-foreground">
                  Idea dump is available on Today and Plans.
                </p>
              </div>
            )}
          </div>
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
          <button
            type="button"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition",
              panelOpen && "bg-card/60 text-foreground shadow-sm outline outline-2 outline-border/50"
            )}
            title="Idea dump"
            onClick={() => setPanelOpen(true)}
          >
            <Lightbulb className="h-4 w-4" />
          </button>
        </nav>
      </aside>
    </>
  );
}

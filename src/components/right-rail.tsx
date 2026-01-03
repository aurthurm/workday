"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  const [tab, setTab] = useState(showIdeas ? "ideas" : "guidance");
  const [showAddForm, setShowAddForm] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: defaultCategories[0].name,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
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
    setTab(showIdeas ? "ideas" : "guidance");
  }, [showIdeas]);

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
        body: {
          title: draft.title,
          category: draft.category,
        },
      }),
    onSuccess: () => {
      setDraft({ title: "", category: categories[0] ?? "Other" });
      setShowAddForm(false);
      ideasQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => ideasQuery.refetch(),
  });

  const handleTitleSave = async (
    taskId: string,
    _day: string,
    nextTitle: string
  ) => {
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { title: trimmed },
    });
    await ideasQuery.refetch();
  };

  const handleTimeSave = async (
    taskId: string,
    _day: string,
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
    await ideasQuery.refetch();
  };

  const handleCategorySave = async (
    taskId: string,
    _day: string,
    category: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { category },
    });
    await ideasQuery.refetch();
  };
  const handleRecurrenceSave = async (
    taskId: string,
    _day: string,
    recurrenceRule: string | null
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { recurrenceRule },
    });
    await ideasQuery.refetch();
  };
  const handleRepeatTill = async (
    taskId: string,
    _day: string,
    repeatTill: string
  ) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { repeatTill },
    });
    await ideasQuery.refetch();
  };
  const handleDeleteRepeat = async (taskId: string, _day: string) => {
    await apiFetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      body: { recurrenceRule: null },
    });
    await ideasQuery.refetch();
  };
  const handleIdeaDragStart = (event: DragEvent<HTMLDivElement>, taskId: string) => {
    event.dataTransfer.setData("text/task-id", taskId);
    event.dataTransfer.setData("text/source-day", "unplanned");
    event.dataTransfer.effectAllowed = "move";
  };

  const ideas = ideasQuery.data?.ideas ?? [];
  const sortedIdeas = useMemo(() => ideas, [ideas]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceSwitcher />
      <Card className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-inset">
        {showIdeas ? (
          <Tabs value={tab} onValueChange={setTab}>
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Right rail
              </p>
              <TabsList>
                <TabsTrigger value="guidance">Guidance</TabsTrigger>
                <TabsTrigger value="ideas">Idea dump</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="guidance" className="mt-4">
              <h3 className="text-sm font-semibold text-foreground">
                Guiding principle
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Make work visible without making people feel watched. Use this
                space to encourage, not to control.
              </p>
            </TabsContent>
            <TabsContent value="ideas" className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Idea dump</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="px-2"
                    onClick={() => setShowAddForm((prev) => !prev)}
                  >
                    {showAddForm ? "Cancel" : "+ Task"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capture unplanned ideas without committing them to a plan.
                </p>
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
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Guiding principle
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">
              Guiding principle
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Make work visible without making people feel watched. Use this
              space to encourage, not to control.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

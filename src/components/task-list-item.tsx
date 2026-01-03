"use client";

import { useEffect, useState, type DragEvent } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Repeat, CalendarClock, ListChecks, Trash2, Clock } from "lucide-react";
import { TaskDetailPanel } from "@/components/task-detail-panel";
import { useEntitlements } from "@/hooks/use-entitlements";

type TaskItem = {
  id: string;
  title: string;
  category: string;
  status: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  due_date?: string | null;
  notes?: string | null;
  priority?: "high" | "medium" | "low" | "none";
  attachments?: Array<{ id: string; url: string }>;
  recurrence_rule?: string | null;
  recurrence_time?: string | null;
  subtasks?: Array<{
    id: string;
    title: string;
    completed: number;
    estimated_minutes: number | null;
    actual_minutes: number | null;
    start_time: string | null;
    end_time: string | null;
  }>;
  repeat_till?: string | null;
};

type TaskListItemProps = {
  task: TaskItem;
  day: string;
  variant?: "kanban" | "list";
  isSelected?: boolean;
  onSelect?: () => void;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  categories: string[];
  getCategoryColor: (name: string) => string;
  normalizeStatus: (status: string) => string;
  formatEstimated: (minutes: number | null) => string;
  getStartTimeInput: (value: string | null) => string;
  onSaveTitle: (taskId: string, day: string, nextTitle: string) => Promise<void>;
  onSaveTime: (
    taskId: string,
    day: string,
    startTime: string,
    estimatedMinutes: string
  ) => Promise<void>;
  onSaveCategory: (taskId: string, day: string, category: string) => Promise<void>;
  onSaveRecurrence: (
    taskId: string,
    day: string,
    recurrenceRule: string | null
  ) => Promise<void>;
  onSetRepeatTill?: (taskId: string, day: string, repeatTill: string) => Promise<void>;
  onDeleteRepeat?: (taskId: string, day: string) => Promise<void>;
  onTaskUpdated?: () => void;
  dueSoonDays?: number;
  readOnly?: boolean;
};

export function TaskListItem({
  task,
  day,
  variant = "kanban",
  isSelected = false,
  onSelect,
  draggable = false,
  onDragStart,
  categories,
  getCategoryColor,
  normalizeStatus,
  formatEstimated,
  getStartTimeInput,
  onSaveTitle,
  onSaveTime,
  onSaveCategory,
  onSaveRecurrence,
  onSetRepeatTill,
  onDeleteRepeat,
  onTaskUpdated,
  dueSoonDays = 3,
  readOnly = false,
}: TaskListItemProps) {
  const entitlementsQuery = useEntitlements();
  const dueDatesEnabled =
    entitlementsQuery.data?.entitlements.features["feature.due_dates"] ?? false;
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [isEditingRecurrence, setIsEditingRecurrence] = useState(false);
  const [isShowingSubtasks, setIsShowingSubtasks] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [timeDraft, setTimeDraft] = useState({
    startTime: getStartTimeInput(task.start_time),
    estimatedMinutes: task.estimated_minutes ? String(task.estimated_minutes) : "",
  });
  const [subtasks, setSubtasks] = useState(task.subtasks ?? []);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [subtasksLoaded, setSubtasksLoaded] = useState(Boolean(task.subtasks));
  const [isLoadingSubtasks, setIsLoadingSubtasks] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState("");
  const [editingSubtaskTimeId, setEditingSubtaskTimeId] = useState<
    string | null
  >(null);
  const [subtaskTimeDrafts, setSubtaskTimeDrafts] = useState<
    Record<string, { startTime: string; estimatedMinutes: string; actualMinutes: string }>
  >({});
  const [repeatTillDraft, setRepeatTillDraft] = useState("");

  useEffect(() => {
    if (!isEditingTime) {
      setTimeDraft({
        startTime: getStartTimeInput(task.start_time),
        estimatedMinutes: task.estimated_minutes
          ? String(task.estimated_minutes)
          : "",
      });
    }
  }, [task.start_time, task.estimated_minutes, isEditingTime, getStartTimeInput]);

  const isLocked =
    readOnly || ["done", "cancelled", "skipped"].includes(task.status);
  const canDrag = !isLocked && draggable && !isEditingTime;
  const dueBadge = (() => {
    if (!dueDatesEnabled || !task.due_date) return null;
    const due = new Date(task.due_date);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) {
      return {
        label: `${diffDays}d`,
        className: "bg-red-100 text-red-700",
      };
    }
    if (diffDays === 0) {
      return { label: "0d", className: "bg-amber-100 text-amber-800" };
    }
    if (diffDays <= dueSoonDays) {
      return { label: `${diffDays}d`, className: "bg-amber-100 text-amber-800" };
    }
    return null;
  })();
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
  const statusOptions = ["planned", "done", "cancelled", "unplanned"];
  const priorityOptions = ["none", "low", "medium", "high"];
  const statusLabel = (value: string) => normalizeStatus(value);

  useEffect(() => {
    setSubtasks(task.subtasks ?? []);
    setSubtasksLoaded(Boolean(task.subtasks));
    setSubtaskDraft("");
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
    setRepeatTillDraft(task.repeat_till ?? "");
  }, [task.id, task.subtasks, task.repeat_till]);

  useEffect(() => {
    if (!isLocked) return;
    setIsEditingTime(false);
    setIsEditingCategory(false);
    setIsEditingRecurrence(false);
    setIsShowingSubtasks(false);
    setIsDetailOpen(false);
  }, [isLocked]);

  useEffect(() => {
    if (!isShowingSubtasks || subtasksLoaded || isLoadingSubtasks) return;
    const load = async () => {
      setIsLoadingSubtasks(true);
      try {
        const response = await apiFetch<{ subtasks: typeof subtasks }>(
          `/api/tasks/${task.id}/subtasks`
        );
        setSubtasks(response.subtasks);
        setSubtasksLoaded(true);
      } finally {
        setIsLoadingSubtasks(false);
      }
    };
    load();
  }, [isShowingSubtasks, subtasksLoaded, isLoadingSubtasks, task.id]);

  const handleSubtaskCreate = async () => {
    const trimmed = subtaskDraft.trim();
    if (!trimmed) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      body: { title: trimmed },
    });
    const response = await apiFetch<{ subtasks: typeof subtasks }>(
      `/api/tasks/${task.id}/subtasks`
    );
    setSubtasks(response.subtasks);
    setSubtasksLoaded(true);
    setSubtaskDraft("");
  };

  const handleSubtaskToggle = async (subtaskId: string, completed: boolean) => {
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "PUT",
      body: { subtaskId, completed },
    });
    setSubtasks((prev) =>
      prev.map((subtask) =>
        subtask.id === subtaskId
          ? { ...subtask, completed: completed ? 1 : 0 }
          : subtask
      )
    );
  };

  const handleSubtaskTitleSave = async (subtaskId: string) => {
    const trimmed = editingSubtaskTitle.trim();
    if (!trimmed) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "PUT",
      body: { subtaskId, title: trimmed },
    });
    setSubtasks((prev) =>
      prev.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, title: trimmed } : subtask
      )
    );
    setEditingSubtaskId(null);
    setEditingSubtaskTitle("");
  };

  const handleSubtaskDelete = async (subtaskId: string) => {
    await apiFetch(`/api/tasks/${task.id}/subtasks?subtaskId=${subtaskId}`, {
      method: "DELETE",
    });
    setSubtasks((prev) => prev.filter((subtask) => subtask.id !== subtaskId));
  };

  const getSubtaskTimeInput = (value: string | null) =>
    value
      ? new Date(value).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";

  const handleSubtaskTimeSave = async (subtaskId: string) => {
    const draft = subtaskTimeDrafts[subtaskId];
    if (!draft) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "PUT",
      body: {
        subtaskId,
        startTime: draft.startTime || null,
        estimatedMinutes: draft.estimatedMinutes
          ? Number(draft.estimatedMinutes)
          : null,
        actualMinutes: draft.actualMinutes ? Number(draft.actualMinutes) : null,
      },
    });
    const response = await apiFetch<{ subtasks: typeof subtasks }>(
      `/api/tasks/${task.id}/subtasks`
    );
    setSubtasks(response.subtasks);
    setSubtasksLoaded(true);
    setEditingSubtaskTimeId(null);
  };

  return (
    <div
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.()}
      onKeyDown={(event) => {
        if (!onSelect) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      draggable={canDrag}
      onDragStart={onDragStart}
      className={
        variant === "list"
          ? `w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
              isSelected
                ? "border-tide-500 bg-card shadow-lg ring-1 ring-tide-200/70"
                : "border-border/70 bg-card/70 hover:border-tide-200"
            } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`
          : `rounded-2xl border border-border/70 bg-card p-3 ${
              canDrag ? "cursor-grab active:cursor-grabbing" : ""
            }`
      }
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="text-left text-sm font-medium text-foreground hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            setIsDetailOpen(true);
          }}
        >
          {task.title}
        </button>
        <span className="status-pill" data-status={normalizeStatus(task.status)}>
          {normalizeStatus(task.status)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <span className="text-xs text-muted-foreground">
              ⌚ {formatEstimated(task.estimated_minutes)}
            </span>
          ) : (
            <>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLocked) return;
                  setIsEditingTime((prev) => !prev);
                }}
              >
                ⌚ {formatEstimated(task.estimated_minutes)}
              </button>
              <button
                type="button"
                className="inline-flex items-center text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLocked) return;
                  setIsEditingRecurrence((prev) => !prev);
                }}
                aria-label="Edit recurring schedule"
              >
                <Repeat className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inline-flex items-center text-muted-foreground hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  if (isLocked) return;
                  setIsShowingSubtasks((prev) => !prev);
                }}
                aria-label="Show subtasks"
              >
                <ListChecks className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {dueBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${dueBadge.className}`}
            >
              <CalendarClock className="h-3 w-3" />
              {dueBadge.label}
            </span>
          )}
        </div>
        {isEditingCategory ? (
          <Select
            value={task.category || categories[0]}
            onValueChange={async (value) => {
              await onSaveCategory(task.id, day, value);
              setIsEditingCategory(false);
            }}
          >
            <SelectTrigger className="h-7 w-[120px] bg-background text-xs">
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
        ) : (
          <button
            type="button"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              if (isLocked) return;
              setIsEditingCategory(true);
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: getCategoryColor(task.category || categories[0]),
              }}
            />
            {task.category || categories[0]}
          </button>
        )}
      </div>
      {isEditingTime && !isLocked && (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="time"
              className="w-[120px]"
              value={timeDraft.startTime}
              onChange={(event) =>
                setTimeDraft((prev) => ({
                  ...prev,
                  startTime: event.target.value,
                }))
              }
            />
            <Input
              type="number"
              className="w-[110px]"
              placeholder="Est."
              value={timeDraft.estimatedMinutes}
              onChange={(event) =>
                setTimeDraft((prev) => ({
                  ...prev,
                  estimatedMinutes: event.target.value,
                }))
              }
            />
            <Button
              size="sm"
              onClick={async (event) => {
                event.stopPropagation();
                await onSaveTime(
                  task.id,
                  day,
                  timeDraft.startTime,
                  timeDraft.estimatedMinutes
                );
                setIsEditingTime(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      {isEditingRecurrence && !isLocked && (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={task.recurrence_rule ?? "none"}
              onValueChange={async (value) => {
                await onSaveRecurrence(
                  task.id,
                  day,
                  value === "none" ? null : value
                );
                setIsEditingRecurrence(false);
              }}
            >
              <SelectTrigger className="h-8 w-[200px] bg-background text-xs">
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
            <Input
              type="date"
              className="h-8 w-[160px]"
              value={repeatTillDraft}
              onChange={(event) => {
                const nextValue = event.target.value;
                setRepeatTillDraft(nextValue);
                if (nextValue && onSetRepeatTill) {
                  onSetRepeatTill(task.id, day, nextValue);
                }
              }}
              onKeyDown={(event) => event.stopPropagation()}
            />
            {task.recurrence_rule && task.recurrence_rule !== "none" && (
              <>
                <button
                  type="button"
                  className="inline-flex items-center text-muted-foreground hover:text-foreground"
                  onClick={async (event) => {
                    event.stopPropagation();
                    if (onDeleteRepeat) {
                      await onDeleteRepeat(task.id, day);
                    } else {
                      await onSaveRecurrence(task.id, day, null);
                    }
                    setIsEditingRecurrence(false);
                  }}
                  aria-label="Delete repeat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {isShowingSubtasks && !isLocked && (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/60 p-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={subtaskDraft}
              placeholder="Add a subtask"
              onChange={(event) => setSubtaskDraft(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              className="h-8 flex-1"
            />
            <Button size="sm" onClick={handleSubtaskCreate}>
              Add
            </Button>
          </div>
          <div className="mt-2 space-y-1">
            {isLoadingSubtasks && (
              <p className="text-xs text-muted-foreground">Loading...</p>
            )}
            {!isLoadingSubtasks && subtasks.length === 0 && (
              <p className="text-xs text-muted-foreground">No subtasks yet.</p>
            )}
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center justify-between rounded-md border border-border/70 bg-card px-2 py-1 text-xs"
                draggable={draggable}
                onDragStart={(event) => {
                  if (!draggable) return;
                  event.stopPropagation();
                  event.dataTransfer.setData("text/subtask-id", subtask.id);
                  event.dataTransfer.setData("text/task-id", task.id);
                  event.dataTransfer.setData("text/source-day", day);
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(subtask.completed)}
                    onChange={(event) =>
                      handleSubtaskToggle(subtask.id, event.target.checked)
                    }
                    disabled={isLocked}
                  />
                  {editingSubtaskId === subtask.id ? (
                    <Input
                      value={editingSubtaskTitle}
                      autoFocus
                      onChange={(event) =>
                        setEditingSubtaskTitle(event.target.value)
                      }
                      onBlur={() => handleSubtaskTitleSave(subtask.id)}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSubtaskTitleSave(subtask.id);
                        }
                        if (event.key === "Escape") {
                          setEditingSubtaskId(null);
                          setEditingSubtaskTitle("");
                        }
                      }}
                      className="h-6 text-xs"
                    />
                  ) : editingSubtaskTimeId === subtask.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        className="h-6 w-[90px] text-[11px]"
                        value={
                          subtaskTimeDrafts[subtask.id]?.startTime ??
                          getSubtaskTimeInput(subtask.start_time)
                        }
                        onChange={(event) =>
                          setSubtaskTimeDrafts((prev) => ({
                            ...prev,
                            [subtask.id]: {
                              startTime: event.target.value,
                              estimatedMinutes:
                                prev[subtask.id]?.estimatedMinutes ??
                                String(subtask.estimated_minutes ?? ""),
                              actualMinutes:
                                prev[subtask.id]?.actualMinutes ??
                                String(subtask.actual_minutes ?? ""),
                            },
                          }))
                        }
                      />
                      <Input
                        type="number"
                        className="h-6 w-[70px] text-[11px]"
                        placeholder="Est"
                        value={subtaskTimeDrafts[subtask.id]?.estimatedMinutes ?? ""}
                        onChange={(event) =>
                          setSubtaskTimeDrafts((prev) => ({
                            ...prev,
                            [subtask.id]: {
                              startTime:
                                prev[subtask.id]?.startTime ??
                                getSubtaskTimeInput(subtask.start_time),
                              estimatedMinutes: event.target.value,
                              actualMinutes:
                                prev[subtask.id]?.actualMinutes ??
                                String(subtask.actual_minutes ?? ""),
                            },
                          }))
                        }
                      />
                      <Input
                        type="number"
                        className="h-6 w-[70px] text-[11px]"
                        placeholder="Act"
                        value={subtaskTimeDrafts[subtask.id]?.actualMinutes ?? ""}
                        onChange={(event) =>
                          setSubtaskTimeDrafts((prev) => ({
                            ...prev,
                            [subtask.id]: {
                              startTime:
                                prev[subtask.id]?.startTime ??
                                getSubtaskTimeInput(subtask.start_time),
                              estimatedMinutes:
                                prev[subtask.id]?.estimatedMinutes ??
                                String(subtask.estimated_minutes ?? ""),
                              actualMinutes: event.target.value,
                            },
                          }))
                        }
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSubtaskTimeSave(subtask.id)}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={
                        subtask.completed
                          ? "text-muted-foreground line-through hover:text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isLocked) return;
                        setEditingSubtaskId(subtask.id);
                        setEditingSubtaskTitle(subtask.title);
                      }}
                    >
                      {subtask.title}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex items-center text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (isLocked) return;
                      setEditingSubtaskTimeId((prev) =>
                        prev === subtask.id ? null : subtask.id
                      );
                      setEditingSubtaskId(null);
                    }}
                    aria-label="Edit subtask time"
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (isLocked) return;
                      handleSubtaskDelete(subtask.id);
                    }}
                    aria-label="Delete subtask"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isDetailOpen && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur">
          <div className="absolute inset-0" onClick={() => setIsDetailOpen(false)} />
          <div
            className="relative h-[85vh] w-[90vw] max-w-4xl overflow-y-auto rounded-2xl border border-border/70 bg-card p-6 shadow-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-display text-foreground">Task details</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsDetailOpen(false)}>
                Close
              </Button>
            </div>
            <TaskDetailPanel
              task={{
                ...task,
                subtasks:
                  task.subtasks?.map((subtask) => ({
                    ...subtask,
                    completed: subtask.completed ?? 0,
                  })) ?? [],
                attachments: task.attachments ?? [],
                notes: task.notes ?? null,
                priority: task.priority ?? "none",
                due_date: task.due_date ?? null,
                repeat_till: task.repeat_till ?? null,
                recurrence_rule: task.recurrence_rule ?? null,
                recurrence_time: task.recurrence_time ?? null,
              }}
              categories={categories}
              getCategoryColor={getCategoryColor}
              statusLabel={statusLabel}
              statuses={statusOptions}
              priorities={priorityOptions}
              comments={[]}
              onUpdated={onTaskUpdated}
              onDeleted={() => {
                setIsDetailOpen(false);
                onTaskUpdated?.();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

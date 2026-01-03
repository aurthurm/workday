"use client";

import { useMemo } from "react";
import { TaskListItem } from "@/components/task-list-item";
import { TaskDetailPanel } from "@/components/task-detail-panel";

type TaskListDetailTask = {
  id: string;
  title: string;
  category: string;
  status: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  due_date: string | null;
  notes: string | null;
  priority: "high" | "medium" | "low" | "none";
  repeat_till: string | null;
  recurrence_rule: string | null;
  recurrence_time: string | null;
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
};

type TaskListDetailComment = {
  id: string;
  task_id?: string | null;
  content: string;
  created_at: string;
  author_name: string;
};

type TaskListDetailPanelProps = {
  tasks: TaskListDetailTask[];
  date: string;
  comments: TaskListDetailComment[];
  categories: string[];
  getCategoryColor: (name: string) => string;
  statusLabel: (status: string) => string;
  statuses: readonly string[];
  priorities: readonly string[];
  selectedTaskId: string | null;
  onSelectTaskId: (taskId: string) => void;
  onSaveTitle: (taskId: string, day: string, title: string) => Promise<void>;
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
  onAddComment?: (taskId: string, content: string) => Promise<void> | void;
  listReadOnly?: boolean;
  detailReadOnly?: boolean;
  dueSoonDays?: number;
  emptyListMessage?: string;
  emptyDetailMessage?: string;
  onUpdated?: () => void;
};

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

export function TaskListDetailPanel({
  tasks,
  date,
  comments,
  categories,
  getCategoryColor,
  statusLabel,
  statuses,
  priorities,
  selectedTaskId,
  onSelectTaskId,
  onSaveTitle,
  onSaveTime,
  onSaveCategory,
  onSaveRecurrence,
  onSetRepeatTill,
  onDeleteRepeat,
  onAddComment,
  listReadOnly = false,
  detailReadOnly = false,
  dueSoonDays,
  emptyListMessage = "No tasks yet for this day.",
  emptyDetailMessage = "Select a task to edit details.",
  onUpdated,
}: TaskListDetailPanelProps) {
  const activeTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0],
    [tasks, selectedTaskId]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
      <div className="space-y-3">
        {tasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            day={date}
            variant="list"
            isSelected={task.id === activeTask?.id}
            onSelect={() => onSelectTaskId(task.id)}
            readOnly={listReadOnly}
            categories={categories}
            getCategoryColor={getCategoryColor}
            normalizeStatus={statusLabel}
            formatEstimated={formatEstimated}
            getStartTimeInput={getStartTimeInput}
            onSaveTitle={onSaveTitle}
            onSaveTime={onSaveTime}
            onSaveCategory={onSaveCategory}
            onSaveRecurrence={onSaveRecurrence}
            onSetRepeatTill={onSetRepeatTill}
            onDeleteRepeat={onDeleteRepeat}
            onTaskUpdated={onUpdated}
            dueSoonDays={dueSoonDays}
          />
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyListMessage}</p>
        )}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card/90 p-4">
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyDetailMessage}</p>
        )}
        {tasks.length > 0 && activeTask && (
          <TaskDetailPanel
            key={activeTask.id}
            task={activeTask}
            categories={categories}
            getCategoryColor={getCategoryColor}
            statusLabel={statusLabel}
            statuses={statuses}
            priorities={priorities}
            comments={comments}
            readOnly={detailReadOnly}
            onAddComment={
              onAddComment && activeTask
                ? (content) => onAddComment(activeTask.id, content)
                : undefined
            }
            onUpdated={onUpdated}
            onDeleted={onUpdated}
          />
        )}
      </div>
    </div>
  );
}

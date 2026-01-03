"use client";

import { type DragEvent } from "react";
import { Badge } from "@/components/ui/badge";

type TimelineSubtask = {
  id: string;
  title: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
};

export type TimelineTask = {
  id: string;
  title: string;
  category: string;
  status: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  subtasks: TimelineSubtask[];
};

type ScheduledTask = {
  kind: "task";
  task: TimelineTask;
  top: number;
  height: number;
  startMins: number;
  duration: number;
};

type ScheduledSubtask = {
  kind: "subtask";
  subtask: TimelineSubtask;
  parentTask: TimelineTask;
  top: number;
  height: number;
  startMins: number;
  duration: number;
};

type TimelinePanelProps = {
  dayKey?: string | null;
  tasks: TimelineTask[];
  getCategoryColor: (category: string) => string;
  normalizeStatus: (status: string) => string;
  isCancelledStatus: (status: string) => boolean;
  canDrag: boolean;
  onTaskDoubleClick?: (task: TimelineTask) => void;
  onTaskDragStart?: (
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    dayKey: string
  ) => void;
  onSubtaskDragStart?: (
    event: DragEvent<HTMLDivElement>,
    subtaskId: string,
    parentTaskId: string,
    dayKey: string
  ) => void;
  onTimelineDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onTimelineDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onUnscheduledDrop?: (event: DragEvent<HTMLDivElement>) => void;
  onUnscheduledDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  showUnscheduled?: boolean;
  emptyMessage?: string;
  pxPerMin?: number;
};

const MINUTES_IN_DAY = 1440;

const toMinutesFromMidnight = (date: Date) =>
  date.getHours() * 60 + date.getMinutes();

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

export function TimelinePanel({
  dayKey,
  tasks,
  getCategoryColor,
  normalizeStatus,
  isCancelledStatus,
  canDrag,
  onTaskDoubleClick,
  onTaskDragStart,
  onSubtaskDragStart,
  onTimelineDrop,
  onTimelineDragOver,
  onUnscheduledDrop,
  onUnscheduledDragOver,
  showUnscheduled = true,
  emptyMessage = "No tasks yet for this day.",
  pxPerMin = 1,
}: TimelinePanelProps) {
  const allSubtasks = tasks.flatMap((task) =>
    task.subtasks.map((subtask) => ({ subtask, parentTask: task }))
  );
  const scheduledTasks: ScheduledTask[] = tasks
    .filter((task) => task.start_time)
    .map((task) => {
      const start = new Date(task.start_time!);
      const startMins = toMinutesFromMidnight(start);
      const duration = getTaskDurationMinutes(task);
      const top = startMins * pxPerMin;
      const height = duration * pxPerMin;
      return { kind: "task", task, top, height, startMins, duration };
    });
  const scheduledSubtasks: ScheduledSubtask[] = allSubtasks
    .filter((item) => item.subtask.start_time)
    .map((item) => {
      const start = new Date(item.subtask.start_time!);
      const startMins = toMinutesFromMidnight(start);
      const duration = item.subtask.end_time
        ? Math.max(
            1,
            Math.round(
              (new Date(item.subtask.end_time).getTime() - start.getTime()) /
                60000
            )
          )
        : item.subtask.estimated_minutes ?? 30;
      const top = startMins * pxPerMin;
      const height = duration * pxPerMin;
      return {
        kind: "subtask",
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
  const timelineHeight = MINUTES_IN_DAY * pxPerMin;
  const unscheduledTasks = showUnscheduled
    ? tasks.filter((task) => !task.start_time)
    : [];

  return (
    <div
      className="relative flex h-full min-h-0 flex-col overflow-y-auto scrollbar-thin"
      data-timeline-scroll
    >
      {showUnscheduled && (
        <div
          className="mb-3 flex-shrink-0 rounded-lg border border-border/70 bg-muted/40 p-3"
          onDragOver={(event) => {
            if (onUnscheduledDrop) {
              event.preventDefault();
            }
            onUnscheduledDragOver?.(event);
          }}
          onDrop={(event) => {
            if (!onUnscheduledDrop) return;
            onUnscheduledDrop(event);
          }}
        >
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Unscheduled
          </p>
          <div className="space-y-1">
            {unscheduledTasks.map((task) => (
              <div
                key={task.id}
                draggable={canDrag}
                onDragStart={(event) => {
                  if (!dayKey || !onTaskDragStart) return;
                  onTaskDragStart(event, task.id, dayKey);
                }}
                className={`rounded-lg border px-2 py-1.5 text-xs ${
                  task.status === "done"
                    ? "border-green-300 bg-green-50 text-green-900"
                    : isCancelledStatus(task.status)
                    ? "border-gray-300 bg-gray-50 text-gray-600"
                    : "border-tide-300 bg-tide-50 text-tide-900"
                } ${
                  canDrag
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-not-allowed opacity-80"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{task.title}</span>
                  <Badge variant="outline" className="h-4 px-1 text-[10px]">
                    {normalizeStatus(task.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: getCategoryColor(task.category) }}
                    />
                    {task.category} · {task.estimated_minutes ?? "—"} min
                  </span>
                </p>
              </div>
            ))}
            {unscheduledTasks.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Drop here to unschedule.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          className="relative w-full"
          style={{ height: timelineHeight }}
          onDragOver={(event) => {
            // Allow drops if we have a drop handler, regardless of canDrag
            if (onTimelineDrop) {
              event.preventDefault();
            }
            onTimelineDragOver?.(event);
          }}
          onDrop={(event) => {
            if (!onTimelineDrop) return;
            onTimelineDrop(event);
          }}
        >
          {Array.from({ length: 24 }, (_, hour) => {
            const top = hour * 60 * pxPerMin;
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
                  <span className="min-h-[60px] w-16 border-r border-border/50 pr-1 text-right text-xs font-medium text-muted-foreground">
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
                  draggable={canDrag}
                  onDragStart={(event) => {
                    if (!dayKey || !onTaskDragStart) return;
                    onTaskDragStart(event, task.id, dayKey);
                  }}
                  onDoubleClick={() => {
                    onTaskDoubleClick?.(task);
                  }}
                  className={`group absolute left-[64px] right-1 border p-1 text-xs text-foreground shadow-sm ${
                    task.status === "done"
                      ? "border-green-300"
                      : isCancelledStatus(task.status)
                      ? "border-gray-300"
                      : "border-tide-300"
                  } ${
                    canDrag
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-not-allowed"
                  } overflow-hidden`}
                  style={{
                    top: item.top,
                    height: item.height,
                    backgroundColor: getCategoryColor(task.category),
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{task.title}</span>
                  </div>
                </div>
              );
            }
            const subtask = item.subtask;
            const borderColor = getCategoryColor(item.parentTask.category);
            const parentStatus = item.parentTask.status;
            return (
              <div
                key={subtask.id}
                draggable={canDrag}
                onDragStart={(event) => {
                  if (!dayKey || !onSubtaskDragStart) return;
                  onSubtaskDragStart(
                    event,
                    subtask.id,
                    item.parentTask.id,
                    dayKey
                  );
                }}
                className={`absolute left-[82px] right-4 overflow-hidden border-l-4 border px-2 py-1 text-[11px] shadow-sm ${
                  parentStatus === "done"
                    ? "border-green-300 bg-green-50 text-green-900"
                    : isCancelledStatus(parentStatus)
                    ? "border-gray-300 bg-gray-50 text-gray-600"
                    : "border-border/70 bg-card text-foreground"
                } ${
                  canDrag
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-not-allowed"
                }`}
                style={{
                  top: item.top,
                  height: item.height,
                  borderLeftColor: borderColor,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{subtask.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {tasks.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </div>
  );
}

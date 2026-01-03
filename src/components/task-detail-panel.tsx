"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { Trash2, Tag, CheckCircle2, Calendar, Flag, Repeat, Clock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const getCsrfToken = () =>
  document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrf_token="))
    ?.split("=")[1];

type TaskAttachment = { id: string; url: string };
type TaskSubtask = {
  id: string;
  title: string;
  completed: number;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
};

export type TaskDetailTask = {
  id: string;
  title: string;
  category: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  status: string;
  notes: string | null;
  priority: "high" | "medium" | "low" | "none";
  due_date: string | null;
  repeat_till: string | null;
  recurrence_rule: string | null;
  recurrence_time: string | null;
  start_time: string | null;
  end_time: string | null;
  attachments: TaskAttachment[];
  subtasks: TaskSubtask[];
};

type TaskComment = {
  id: string;
  task_id?: string | null;
  content: string;
  created_at: string;
  author_name: string;
};

type TaskDetailPanelProps = {
  task: TaskDetailTask;
  categories: string[];
  getCategoryColor: (name: string) => string;
  statusLabel: (status: string) => string;
  statuses: readonly string[];
  priorities: readonly string[];
  comments?: TaskComment[];
  onUpdated?: () => void;
  onDeleted?: () => void;
  readOnly?: boolean;
  onAddComment?: (content: string) => Promise<void> | void;
};

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

export function TaskDetailPanel({
  task,
  categories,
  getCategoryColor,
  statusLabel,
  statuses,
  priorities,
  comments = [],
  onUpdated,
  onDeleted,
  readOnly = false,
  onAddComment,
}: TaskDetailPanelProps) {
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [activeHeaderControl, setActiveHeaderControl] = useState<
    "category" | "status" | "due" | "priority" | "recurring" | "timing" | null
  >(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSubtaskDraft("");
    setCommentDraft("");
    setAttachmentFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }, [task.id]);

  const emitUpdated = () => {
    onUpdated?.();
    window.dispatchEvent(new Event("plans:updated"));
    window.dispatchEvent(new Event("timeline:updated"));
  };

  const isLocked =
    readOnly || ["done", "cancelled", "skipped"].includes(task.status);

  const updateTask = async (updates: Record<string, unknown>) => {
    await apiFetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      body: updates,
    });
    emitUpdated();
  };

  const handleDelete = async () => {
    if (isLocked) return;
    const result = await Swal.fire({
      title: "Remove task?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remove",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });
    if (!result.isConfirmed) return;
    await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    onDeleted?.();
    emitUpdated();
  };

  const uploadAttachment = async () => {
    if (isLocked) return;
    if (attachmentFiles.length === 0) return;
    for (const file of attachmentFiles) {
      const formData = new FormData();
      formData.append("file", file);
      const csrfToken = getCsrfToken();
      const response = await fetch(`/api/tasks/${task.id}/attachments/upload`, {
        method: "POST",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.error ?? "Upload failed.";
        throw new Error(message);
      }
    }
    setAttachmentFiles([]);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
    emitUpdated();
  };

  const removeAttachment = async (attachmentId: string) => {
    if (isLocked) return;
    await apiFetch(
      `/api/tasks/${task.id}/attachments?attachmentId=${attachmentId}`,
      { method: "DELETE" }
    );
    emitUpdated();
  };

  const createSubtask = async () => {
    if (isLocked) return;
    const trimmed = subtaskDraft.trim();
    if (!trimmed) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      body: { title: trimmed },
    });
    setSubtaskDraft("");
    emitUpdated();
  };

  const updateSubtask = async (subtaskId: string, completed: boolean) => {
    if (isLocked) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks`, {
      method: "PUT",
      body: { subtaskId, completed },
    });
    emitUpdated();
  };

  const deleteSubtask = async (subtaskId: string) => {
    if (isLocked) return;
    await apiFetch(`/api/tasks/${task.id}/subtasks?subtaskId=${subtaskId}`, {
      method: "DELETE",
    });
    emitUpdated();
  };

  const taskComments = comments.filter((note) => note.task_id === task.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Task detail
        </p>
        <div className="flex items-center gap-2">
          <span className="status-pill" data-status={task.status}>
            {statusLabel(task.status)}
          </span>
          {isLocked && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateTask({ status: "planned" })}
            >
              Reinstate
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) =>
                  prev === "category" ? null : "category"
                )
              }
              disabled={isLocked}
              aria-label="Edit category"
              title="Category"
            >
              <Tag className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) =>
                  prev === "status" ? null : "status"
                )
              }
              disabled={isLocked}
              aria-label="Edit status"
              title="Status"
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) => (prev === "due" ? null : "due"))
              }
              disabled={isLocked}
              aria-label="Edit due date"
              title="Due date"
            >
              <Calendar className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) =>
                  prev === "priority" ? null : "priority"
                )
              }
              disabled={isLocked}
              aria-label="Edit priority"
              title="Priority"
            >
              <Flag className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) =>
                  prev === "recurring" ? null : "recurring"
                )
              }
              disabled={isLocked}
              aria-label="Edit recurring schedule"
              title="Recurring"
            >
              <Repeat className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() =>
                setActiveHeaderControl((prev) =>
                  prev === "timing" ? null : "timing"
                )
              }
              disabled={isLocked}
              aria-label="Edit timing"
              title="Timing"
            >
              <Clock className="h-4 w-4" />
            </Button>
          </div>
          {!isLocked && (
            <Button
              variant="ghost"
              size="icon"
              className="text-red-600 hover:text-red-700"
              onClick={handleDelete}
              aria-label="Remove task"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {activeHeaderControl && (
        <div className="rounded-xl border border-border/70 bg-muted/60 p-3">
          {activeHeaderControl === "category" && (
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Category
              </span>
              <Select
                defaultValue={task.category}
                onValueChange={(value) => updateTask({ category: value })}
                disabled={isLocked}
              >
                <SelectTrigger className="w-[200px] bg-card">
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
            </div>
          )}
          {activeHeaderControl === "status" && (
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Status
              </span>
              <Select
                defaultValue={task.status}
                onValueChange={(value) => updateTask({ status: value })}
                disabled={isLocked}
              >
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {activeHeaderControl === "due" && (
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Due date
              </span>
              <Input
                type="date"
                defaultValue={task.due_date ?? ""}
                className="w-[200px]"
                onBlur={(event) =>
                  updateTask({ dueDate: event.target.value || null })
                }
                disabled={isLocked}
              />
            </div>
          )}
          {activeHeaderControl === "priority" && (
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Priority
              </span>
              <Select
                defaultValue={task.priority ?? "none"}
                onValueChange={(value) => updateTask({ priority: value })}
                disabled={isLocked}
              >
                <SelectTrigger className="w-[200px] bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorities.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {activeHeaderControl === "recurring" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Recurring
              </span>
              <Select
                defaultValue={task.recurrence_rule ?? "none"}
                onValueChange={(value) =>
                  updateTask({
                    recurrenceRule: value === "none" ? null : value,
                  })
                }
                disabled={isLocked}
              >
                <SelectTrigger className="w-[220px] bg-card">
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
              {task.recurrence_rule === "specific_time" && (
                <Input
                  type="time"
                  defaultValue={task.recurrence_time ?? ""}
                  onBlur={(event) =>
                    updateTask({ recurrenceTime: event.target.value })
                  }
                  className="w-[140px]"
                  disabled={isLocked}
                />
              )}
              {task.recurrence_rule && task.recurrence_rule !== "none" && !isLocked && (
                <>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const result = await Swal.fire({
                        title: "Set final repeat date",
                        text: "Choose the last date this repeat should appear.",
                        input: "date",
                        showCancelButton: true,
                        confirmButtonText: "Save",
                        cancelButtonText: "Cancel",
                      });
                      if (result.isConfirmed && result.value) {
                        updateTask({ repeatTill: result.value });
                      }
                    }}
                  >
                    Cancel repeat
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => updateTask({ recurrenceRule: null })}
                  >
                    Delete repeat
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      const result = await Swal.fire({
                        title: "Delete all instances?",
                        text: "This removes every future occurrence.",
                        icon: "warning",
                        showCancelButton: true,
                        confirmButtonText: "Delete all",
                        cancelButtonText: "Cancel",
                        confirmButtonColor: "#dc2626",
                      });
                      if (result.isConfirmed) {
                        updateTask({ recurrenceAction: "delete_all" });
                      }
                    }}
                  >
                    Delete all
                  </Button>
                </>
              )}
            </div>
          )}
          {activeHeaderControl === "timing" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Timing
              </span>
              <Input
                type="number"
                defaultValue={task.estimated_minutes ?? ""}
                className="w-[120px]"
                placeholder="Est."
                onBlur={(event) =>
                  updateTask({
                    estimatedMinutes: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                disabled={isLocked}
              />
              <Input
                type="time"
                defaultValue={
                  task.start_time
                    ? new Date(task.start_time).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : ""
                }
                className="w-[140px]"
                placeholder="Start"
                onBlur={(event) => updateTask({ startTime: event.target.value })}
                disabled={isLocked}
              />
              <Input
                type="number"
                defaultValue={task.actual_minutes ?? ""}
                className="w-[120px]"
                placeholder="Actual"
                onBlur={(event) =>
                  updateTask({
                    actualMinutes: event.target.value
                      ? Number(event.target.value)
                      : null,
                  })
                }
                disabled={isLocked}
              />
            </div>
          )}
        </div>
      )}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Title
          </span>
          <Input
            defaultValue={task.title}
            className="flex-1"
            onBlur={(event) => updateTask({ title: event.target.value })}
            disabled={isLocked}
          />
        </div>
        <div className="flex items-start gap-3">
          <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Notes
          </span>
          <Textarea
            defaultValue={task.notes ?? ""}
            placeholder="Notes"
            className="flex-1"
            onBlur={(event) => updateTask({ notes: event.target.value })}
            disabled={isLocked}
          />
        </div>
        <div className="flex items-start gap-3">
          <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Attachments
          </span>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {!isLocked && (
                <>
                  <label className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm hover:bg-muted">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(event) =>
                        setAttachmentFiles(Array.from(event.target.files ?? []))
                      }
                    />
                    Choose files
                    {attachmentFiles.length > 0 && (
                      <span className="text-muted-foreground">
                        ({attachmentFiles.length})
                      </span>
                    )}
                  </label>
                  <Button
                    onClick={uploadAttachment}
                    disabled={attachmentFiles.length === 0}
                  >
                    Upload
                  </Button>
                </>
              )}
            </div>
            <div className="space-y-2">
              {(task.attachments ?? []).map((attachment) => {
                const filename = attachment.url.split("/").pop() ?? attachment.url;
                return (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="truncate text-muted-foreground">{filename}</span>
                    <div className="flex items-center gap-2">
                      <a
                        href={attachment.url}
                        className="text-muted-foreground hover:text-foreground"
                        download
                      >
                        Download
                      </a>
                      {!isLocked && (
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {(task.attachments ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No attachments yet.
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-28 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Subtasks
          </span>
          <div className="flex-1 space-y-2">
            {!isLocked && (
              <div className="flex flex-wrap gap-2">
                <Input
                  value={subtaskDraft}
                  placeholder="Add a subtask"
                  onChange={(event) => setSubtaskDraft(event.target.value)}
                  className="flex-1"
                />
                <Button onClick={createSubtask} disabled={!subtaskDraft.trim()}>
                  Add
                </Button>
              </div>
            )}
            <div className="space-y-2">
              {(task.subtasks ?? []).map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
                >
                  <label className="flex items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={Boolean(subtask.completed)}
                    onChange={(event) =>
                      updateSubtask(subtask.id, event.target.checked)
                    }
                    disabled={isLocked}
                  />
                    <span
                      className={
                        subtask.completed ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {subtask.title}
                    </span>
                  </label>
                  {!isLocked && (
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => deleteSubtask(subtask.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {(task.subtasks ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No subtasks yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Task comments
        </p>
        <div className="space-y-2">
          {taskComments.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-border/70 bg-muted/60 p-3 text-sm"
            >
              <p className="text-muted-foreground">{note.content}</p>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{note.author_name}</Badge>
                <span>{formatRelativeTime(note.created_at)}</span>
              </div>
            </div>
          ))}
          {taskComments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No task comments yet.
            </p>
          )}
        </div>
        {onAddComment && (
          <>
            <Textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Leave a task comment."
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  const trimmed = commentDraft.trim();
                  if (!trimmed) return;
                  await onAddComment(trimmed);
                  setCommentDraft("");
                }}
                disabled={!commentDraft.trim()}
              >
                Comment on task
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

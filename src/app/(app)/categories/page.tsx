"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type CategoryResponse = {
  categories: Array<{ id: string; name: string; color: string }>;
  role: "member" | "supervisor" | "admin";
};

export default function CategoriesPage() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#64748b");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#64748b");
  const [feedback, setFeedback] = useState("");
  const { data, refetch, error } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<CategoryResponse>("/api/categories"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/categories", {
        method: "POST",
        body: { name, color },
      }),
    onSuccess: () => {
      setName("");
      setColor("#64748b");
      setFeedback("");
      refetch();
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/categories?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setFeedback("");
      refetch();
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; name: string; color: string }) =>
      apiFetch("/api/categories", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: () => {
      setEditId(null);
      setEditName("");
      setEditColor("#64748b");
      setFeedback("");
      refetch();
    },
    onError: (error: Error) => setFeedback(error.message),
  });

  const canManage = data?.role !== "member";
  const sorted = useMemo(
    () => (data?.categories ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [data?.categories]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-display text-foreground">Categories</h3>
        <p className="text-sm text-muted-foreground">
          Admins and supervisors can manage task categories for the workspace.
        </p>
      </div>

      {(error || feedback) && (
        <p className="text-sm text-destructive">
          {feedback || (error as Error).message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workspace categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && (
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to add or remove categories.
            </p>
          )}
          <div className="space-y-2">
            {sorted.map((category) => {
              const isEditing = editId === category.id;
              return (
                <div
                  key={category.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                >
                  {isEditing ? (
                    <>
                      <Input
                        className="min-w-[180px] flex-1"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                      <Input
                        type="color"
                        className="h-9 w-12 p-1"
                        value={editColor}
                        onChange={(event) => setEditColor(event.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="text-sm text-foreground">
                        {category.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {category.color}
                      </Badge>
                    </>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    {canManage && (
                      <>
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: category.id,
                                  name: editName.trim(),
                                  color: editColor,
                                })
                              }
                              disabled={!editName.trim() || updateMutation.isPending}
                            >
                              {updateMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditId(null);
                                setEditName("");
                                setEditColor("#64748b");
                                setFeedback("");
                              }}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditId(category.id);
                                setEditName(category.name);
                                setEditColor(category.color);
                                setFeedback("");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteMutation.mutate(category.id)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? "Deleting..." : "Delete"}
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground">No categories yet.</p>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[220px] flex-1"
                placeholder="Add category"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                type="color"
                className="h-9 w-12 p-1"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                title="Pick a color"
              />
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Adding..." : "Add category"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type CategoryResponse = {
  categories: Array<{ id: string; name: string }>;
  role: "member" | "supervisor" | "admin";
};

export default function CategoriesPage() {
  const [name, setName] = useState("");
  const { data, refetch, error } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<CategoryResponse>("/api/categories"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/categories", {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => {
      setName("");
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/categories?id=${id}`, { method: "DELETE" }),
    onSuccess: () => refetch(),
  });

  const canManage = data?.role !== "member";
  const sorted = useMemo(
    () => (data?.categories ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [data?.categories]
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-display text-ink-900">Categories</h3>
        <p className="text-sm text-ink-600">
          Admins and supervisors can manage task categories for the workspace.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Workspace categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && (
            <p className="text-sm text-ink-500">
              You don&apos;t have permission to add or remove categories.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {sorted.map((category) => (
              <Badge key={category.id} variant="outline" className="gap-2">
                {category.name}
                {canManage && (
                  <button
                    className="text-ink-500 hover:text-ink-900"
                    onClick={() => deleteMutation.mutate(category.id)}
                  >
                    ×
                  </button>
                )}
              </Badge>
            ))}
            {sorted.length === 0 && (
              <p className="text-sm text-ink-500">No categories yet.</p>
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
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
              >
                Add category
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

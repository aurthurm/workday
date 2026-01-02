"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    workspaceName: "",
  });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ user: { id: string } }>("/api/auth/register", {
        method: "POST",
        body: form,
      }),
    onSuccess: () => router.push("/today"),
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff,_#eaf4f2_45%,_#f7f4ef_100%)] px-6 py-16">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-tide-700">
            Workday
          </p>
          <h1 className="mt-3 text-4xl font-display text-ink-900">
            Start your workspace
          </h1>
          <p className="mt-2 text-base text-ink-600">
            Create a calm, lightweight place for daily planning.
          </p>
        </div>

        <Card className="border border-ink-200/70 bg-white/90 shadow-card">
          <CardHeader>
            <CardTitle className="text-xl">Create account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Name</label>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Your name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">
                Password
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Create a password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-700">
                Workspace name
              </label>
              <Input
                value={form.workspaceName}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    workspaceName: event.target.value,
                  }))
                }
                placeholder="Acme Operations"
              />
            </div>
            {mutation.error && (
              <p className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            <div className="flex flex-col gap-3">
              <Button
                className="h-11 w-full"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "Creating..." : "Create workspace"}
              </Button>
              <Button
                variant="ghost"
                className="h-11 w-full"
                onClick={() => router.push("/login")}
              >
                Back to sign in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });

  const mutation = useMutation({
    mutationFn: () =>
      apiFetch<{ user: { id: string } }>("/api/auth/login", {
        method: "POST",
        body: form,
      }),
    onSuccess: () => router.push("/today"),
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#ffffff,_#f4efe7_50%,_#f7f4ef_100%)] px-6 py-16">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-tide-700">
            Workday
          </p>
          <h1 className="mt-3 text-4xl font-display text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Plan your day, capture the work, and leave space for reflection.
          </p>
        </div>

        <Card className="border border-border/70 bg-card/90 shadow-card">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Email</label>
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
              <label className="text-sm font-medium text-muted-foreground">
                Password
              </label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="••••••••"
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
                {mutation.isPending ? "Signing in..." : "Continue"}
              </Button>
              <Button
                variant="ghost"
                className="h-11 w-full"
                onClick={() => router.push("/register")}
              >
                Create an account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

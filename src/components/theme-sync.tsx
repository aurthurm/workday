"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export function ThemeSync() {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () =>
      apiFetch<{ settings: { appearance: "light" | "dark" } }>("/api/settings"),
  });

  useEffect(() => {
    const appearance = settingsQuery.data?.settings.appearance;
    if (!appearance) return;
    document.documentElement.classList.toggle("dark", appearance === "dark");
  }, [settingsQuery.data?.settings.appearance]);

  return null;
}

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function RegisterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-display text-foreground">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If the problem persists, contact support.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

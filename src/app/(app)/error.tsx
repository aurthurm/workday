"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("App error boundary caught:", error);
    }
  }, [error]);

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-card">
        <div className="mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground">
            Oops! Something went wrong
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Don't worry, your data is safe. Please try refreshing the page.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="mb-4 rounded-lg bg-red-50 p-3">
            <p className="text-xs font-mono text-red-900">{error.message}</p>
            {error.digest && (
              <p className="mt-1 text-xs text-red-700">Error ID: {error.digest}</p>
            )}
            {error.stack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-red-700">
                  Stack trace
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-red-800">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={reset} className="flex-1">
            Try again
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="flex-1"
          >
            Refresh page
          </Button>
        </div>
      </div>
    </div>
  );
}

import { AlertCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorMessageProps {
  error: Error | string | null | undefined;
  className?: string;
  variant?: "inline" | "card";
  onDismiss?: () => void;
}

export function ErrorMessage({ 
  error, 
  className, 
  variant = "inline",
  onDismiss 
}: ErrorMessageProps) {
  if (!error) return null;

  const message = typeof error === "string" ? error : error.message;

  if (variant === "card") {
    return (
      <div
        className={cn(
          "rounded-lg border border-red-200 bg-red-50 p-4",
          className
        )}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-900">Error</h3>
            <p className="mt-1 text-sm text-red-700">{message}</p>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="flex-shrink-0 text-red-400 hover:text-red-600"
              aria-label="Dismiss error"
            >
              <XCircle className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2 text-sm text-red-600", className)}>
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-auto text-red-400 hover:text-red-600"
          aria-label="Dismiss error"
        >
          <XCircle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

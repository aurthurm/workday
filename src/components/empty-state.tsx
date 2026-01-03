import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-muted/30 p-12 text-center",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-lg font-display font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface EmptyStateCompactProps {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyStateCompact({ message, action }: EmptyStateCompactProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button onClick={action.onClick} size="sm" variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}

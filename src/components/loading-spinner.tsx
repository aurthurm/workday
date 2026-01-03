import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export function LoadingSpinner({ size = "md", text, className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-4",
    lg: "h-12 w-12 border-4",
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-tide-200 border-t-tide-600",
          sizeClasses[size]
        )}
      />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

interface LoadingButtonProps {
  loading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  [key: string]: any;
}

export function LoadingButton({ 
  loading, 
  children, 
  disabled, 
  ...props 
}: LoadingButtonProps) {
  return (
    <button {...props} disabled={disabled || loading}>
      {loading ? (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>{typeof children === "string" ? children : "Loading..."}</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
}

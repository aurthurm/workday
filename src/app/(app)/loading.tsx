export default function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-tide-200 border-t-tide-600" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export function formatRelativeTime(date: string) {
  const now = new Date().getTime();
  const then = new Date(date).getTime();
  const diffMs = Math.max(now - then, 0);
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return `${days}d ago`;
  if (hours >= 1) return `${hours}h ago`;
  if (minutes >= 1) return `${minutes}m ago`;
  return "just now";
}

export function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function apiFetch<T>(
  url: string,
  options?: Omit<RequestInit, "body"> & { body?: unknown }
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload?.error ?? `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// User-friendly error messages based on status code
function getErrorMessage(status: number, serverMessage?: string): string {
  // Use server message for client errors (4xx)
  if (status >= 400 && status < 500) {
    return serverMessage || "Invalid request. Please check your input.";
  }

  // Generic messages for server errors (5xx)
  switch (status) {
    case 500:
      return "Server error. Please try again later.";
    case 502:
    case 503:
      return "Service temporarily unavailable. Please try again in a moment.";
    case 504:
      return "Request timeout. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export async function apiFetch<T>(
  url: string,
  options?: Omit<RequestInit, "body"> & { body?: unknown; timeout?: number }
): Promise<T> {
  const csrfToken =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((cookie) => cookie.startsWith("workday_csrf="))
          ?.split("=")[1]
      : undefined;

  // Set up timeout (default 30 seconds)
  const timeout = options?.timeout || 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...(options?.headers ?? {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = getErrorMessage(response.status, payload?.error);
      throw new ApiError(message, response.status, payload?.code);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort/timeout
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("Request timeout. Please try again.", 504);
    }

    // Handle network errors
    if (error instanceof TypeError) {
      throw new ApiError(
        "Network error. Please check your connection.",
        0,
        "NETWORK_ERROR"
      );
    }

    // Re-throw ApiError as-is
    if (error instanceof ApiError) {
      throw error;
    }

    // Unknown error
    throw new ApiError("An unexpected error occurred. Please try again.");
  }
}

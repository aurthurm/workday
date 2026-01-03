type LogLevel = "info" | "warn" | "error";

export function logEvent(params: {
  level?: LogLevel;
  event: string;
  message: string;
  userId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level: params.level ?? "info",
    event: params.event,
    message: params.message,
    userId: params.userId,
    ip: params.ip,
    meta: params.meta,
  };

  const line = JSON.stringify(payload);
  if (params.level === "error") {
    console.error(line);
  } else if (params.level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim();
  }
  return request.headers.get("x-real-ip") ?? undefined;
}


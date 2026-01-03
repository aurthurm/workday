type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateEntry>();

export function rateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    const next: RateEntry = { count: 1, resetAt: now + options.windowMs };
    store.set(key, next);
    return { allowed: true, remaining: options.max - 1, resetAt: next.resetAt };
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, options.max - entry.count),
    resetAt: entry.resetAt,
  };
}


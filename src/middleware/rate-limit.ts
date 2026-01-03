import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter
// For production, consider using Redis or a distributed solution
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean up every minute

export function rateLimit(
  request: NextRequest,
  options: RateLimitOptions
): { allowed: boolean; response?: NextResponse } {
  // Get client identifier (IP address or forwarded IP)
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Create a unique key for this client and path
  const key = `${clientIp}:${request.nextUrl.pathname}`;

  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || record.resetAt < now) {
    // First request or window expired, create new record
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { allowed: true };
  }

  // Increment counter
  record.count++;

  if (record.count > options.maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter,
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": options.maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": record.resetAt.toString(),
          },
        }
      ),
    };
  }

  return { allowed: true };
}

// Preset configurations
export const authRateLimit = (request: NextRequest) =>
  rateLimit(request, {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 login attempts per 15 minutes
  });

export const apiRateLimit = (request: NextRequest) =>
  rateLimit(request, {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  });

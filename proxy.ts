import { NextResponse, type NextRequest } from "next/server";

const CSRF_COOKIE = "csrf_token";

function addSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
}

export function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  const isApi = request.nextUrl.pathname.startsWith("/api");
  const csrfCookie = request.cookies.get(CSRF_COOKIE)?.value;
  const response = NextResponse.next();

  if (!csrfCookie && (method === "GET" || method === "HEAD")) {
    const token = crypto.randomUUID();
    response.cookies.set(CSRF_COOKIE, token, {
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });
  }

  if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const header = request.headers.get("x-csrf-token");
    if (!header || !csrfCookie || header !== csrfCookie) {
      const denied = NextResponse.json(
        { error: "CSRF token missing or invalid." },
        { status: 403 }
      );
      addSecurityHeaders(denied);
      return denied;
    }
  }

  addSecurityHeaders(response);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

const CSRF_TOKEN_COOKIE = "workday_csrf";
const CSRF_TOKEN_HEADER = "x-csrf-token";

// Generate a CSRF token and set it in a cookie
export function generateCsrfToken(): string {
  return nanoid(32);
}

// Validate CSRF token from request
export function validateCsrfToken(request: NextRequest): boolean {
  const method = request.method;
  
  // Only validate for state-changing operations
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return true;
  }

  // Get token from cookie
  const cookieToken = request.cookies.get(CSRF_TOKEN_COOKIE)?.value;
  if (!cookieToken) {
    return false;
  }

  // Get token from header
  const headerToken = request.headers.get(CSRF_TOKEN_HEADER);
  if (!headerToken) {
    return false;
  }

  // Compare tokens
  return cookieToken === headerToken;
}

// Middleware to set CSRF token cookie on GET requests
export function csrfMiddleware(request: NextRequest): NextResponse {
  const method = request.method;
  
  // For state-changing operations, validate token
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    if (!validateCsrfToken(request)) {
      return NextResponse.json(
        { error: "CSRF token validation failed" },
        { status: 403 }
      );
    }
  }

  // Continue with the request
  const response = NextResponse.next();

  // Set CSRF token cookie on GET requests if not present
  if (method === "GET" && !request.cookies.get(CSRF_TOKEN_COOKIE)) {
    const token = generateCsrfToken();
    response.cookies.set(CSRF_TOKEN_COOKIE, token, {
      httpOnly: false, // Must be readable by JavaScript
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

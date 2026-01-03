"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
        }}>
          <div style={{
            maxWidth: "28rem",
            width: "100%",
            padding: "1.5rem",
            border: "1px solid #e5e7eb",
            borderRadius: "1rem",
            boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
          }}>
            <h2 style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              marginBottom: "0.5rem",
            }}>
              Application Error
            </h2>
            <p style={{
              fontSize: "0.875rem",
              color: "#6b7280",
              marginBottom: "1rem",
            }}>
              A critical error occurred. Please refresh the page to continue.
            </p>
            <button
              onClick={reset}
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                backgroundColor: "#2563eb",
                color: "white",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: "500",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

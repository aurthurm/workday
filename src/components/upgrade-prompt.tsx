"use client";

import { useEffect } from "react";
import Swal from "sweetalert2";

export function UpgradePrompt() {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { feature?: string; limit?: string; max?: number }
        | undefined;
      const title = "Upgrade required";
      const message = detail?.feature
        ? "This feature is not available on your plan."
        : "You have reached a plan limit.";
      Swal.fire({
        title,
        text: message,
        icon: "info",
        confirmButtonText: "View plans",
      });
    };
    window.addEventListener("upgrade:required", handler as EventListener);
    return () => window.removeEventListener("upgrade:required", handler as EventListener);
  }, []);

  return null;
}

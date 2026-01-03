"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Skip links for keyboard navigation
 * Allows users to skip to main content or navigation
 */
export function SkipLinks() {
  return (
    <div className="sr-only focus-within:not-sr-only">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[9999] rounded-lg bg-tide-600 px-4 py-2 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-tide-400 focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <a
        href="#navigation"
        className="fixed left-4 top-16 z-[9999] rounded-lg bg-tide-600 px-4 py-2 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-tide-400 focus:ring-offset-2"
      >
        Skip to navigation
      </a>
    </div>
  );
}

/**
 * Live region for screen reader announcements
 * Announces route changes and important updates
 */
export function LiveRegion() {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Announce route changes
    const routeNames: Record<string, string> = {
      "/today": "Today's plan page",
      "/history": "Plans history page",
      "/supervisor": "Team overview page",
      "/profile": "Profile page",
    };

    const pageName = routeNames[pathname] || "Page";
    setAnnouncement(`Navigated to ${pageName}`);

    // Clear announcement after it's been read
    const timer = setTimeout(() => setAnnouncement(""), 1000);
    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}

/**
 * Custom announcement hook for components
 * Use this to announce dynamic content changes
 */
export function useAnnounce() {
  const [message, setMessage] = useState("");

  const announce = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 1000);
  };

  const AnnouncementRegion = () => (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );

  return { announce, AnnouncementRegion };
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/today", label: "Today" },
  { href: "/history", label: "Plans" },
  { href: "/supervisor", label: "Team Overview" },
  { href: "/categories", label: "Categories" },
  { href: "/profile", label: "My Profile" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-xl px-4 py-3 text-sm font-medium transition",
              isActive
                ? "bg-tide-100 text-tide-800 shadow-inset"
                : "text-ink-600 hover:bg-ink-100/60 hover:text-ink-900"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-ink-200/70 bg-white/90 px-4 py-3 backdrop-blur">
      <div className="grid grid-cols-4 gap-2 text-xs font-medium">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-2 py-2 text-center",
                isActive
                  ? "bg-tide-100 text-tide-800"
                  : "text-ink-600"
              )}
            >
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function UserMenu({ name }: { name: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 px-4 text-xs">
          {name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={async () => {
            await apiFetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

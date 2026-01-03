"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  CalendarDays,
  History,
  Users,
  Settings,
  LogOut,
  User,
  HelpCircle,
  UserCircle,
} from "lucide-react";
import { SettingsModal } from "@/components/settings-modal";

const navItems = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/history", label: "Plans", icon: History },
  { href: "/supervisor", label: "Team Overview", icon: Users },
];

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
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
              "flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition",
              collapsed && "justify-center px-2",
              isActive
                ? "bg-tide-100 text-tide-800 shadow-inset"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function UserMenu({
  name,
  collapsed = false,
}: {
  name: string;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<
    | "profile"
    | "subscription"
    | "general"
    | "invitations"
    | "workspaces"
    | "organizations"
    | "categories"
    | "integrations"
    | "ai"
    | "due_dates"
  >("profile");

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <button
          className={cn(
            "flex h-10 w-full items-center gap-2 text-sm font-medium text-foreground hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
          onClick={() => setIsUserMenuOpen((prev) => !prev)}
          type="button"
        >
          <User className="h-4 w-4 text-muted-foreground" />
          {!collapsed && name}
        </button>
        {isUserMenuOpen && (
          <div
            className={cn(
              "absolute z-10 w-48 rounded-xl border border-border/70 bg-card p-2 shadow-card",
              collapsed ? "left-full bottom-0 ml-3" : "left-full bottom-[-24px] ml-3"
            )}
          >
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setSettingsTab("general");
                setIsSettingsOpen(true);
                setIsUserMenuOpen(false);
              }}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setSettingsTab("profile");
                setIsSettingsOpen(true);
                setIsUserMenuOpen(false);
              }}
            >
              <UserCircle className="mr-2 h-4 w-4" />
              Profile
            </Button>
            <Link
              href="/help"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
              onClick={() => setIsUserMenuOpen(false)}
            >
              <HelpCircle className="h-4 w-4" />
              Help
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={async () => {
                await apiFetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
      />
    </div>
  );
}

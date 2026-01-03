import { redirect } from "next/navigation";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { SidebarShell } from "@/components/sidebar-shell";
import { RightRail } from "@/components/right-rail";
import { ThemeSync } from "@/components/theme-sync";
import { MobileHeader } from "@/components/mobile-header";
import { MobileNav } from "@/components/mobile-nav";
import { SkipLinks, LiveRegion } from "@/components/accessibility";
import { UpgradePrompt } from "@/components/upgrade-prompt";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const active = getActiveWorkspace(session.userId, await getWorkspaceCookie());

  return (
    <div className="h-screen w-full overflow-hidden bg-background">
      <ThemeSync />
      <SkipLinks />
      <LiveRegion />
      <UpgradePrompt />

      {/* Mobile Header - Only on mobile */}
      <MobileHeader
        name={session.name}
        workspaceName={active?.workspace?.name ?? "Workspace"}
        role={active?.membership?.role ?? "member"}
      />

      <div className="flex h-full w-full lg:h-full">
        {/* Desktop Sidebar - Hidden on mobile */}
        <aside id="navigation" aria-label="Main navigation">
          <SidebarShell
            name={session.name}
            workspaceName={active?.workspace?.name ?? "Workspace"}
            role={active?.membership?.role ?? "member"}
          />
        </aside>

        {/* Main Content - With mobile padding for header and bottom nav */}
        <main id="main-content" className="flex min-w-0 flex-1 flex-col lg:h-full">
          <div className="h-full overflow-auto p-4 pb-20 lg:p-6 lg:pb-6">
            {children}
          </div>
        </main>

        {/* Right Rail - Hidden on mobile and tablets */}
        <aside className="relative hidden shrink-0 xl:flex" aria-label="Additional tools">
          <RightRail />
        </aside>
      </div>

      {/* Mobile Bottom Navigation - Only on mobile */}
      <MobileNav />
    </div>
  );
}

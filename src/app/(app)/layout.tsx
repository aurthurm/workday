import { redirect } from "next/navigation";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { SidebarNav, UserMenu } from "@/components/nav";
import { RightRail } from "@/components/right-rail";
import { ThemeSync } from "@/components/theme-sync";

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
    <div className="min-h-screen bg-background">
      <ThemeSync />
      <div className="mx-auto grid w-full max-w-none gap-6 px-6 pb-24 pt-8 lg:grid-cols-[240px_1fr_280px]">
        <aside className="sticky top-8 hidden h-[calc(100vh-4rem)] flex-col gap-6 overflow-visible rounded-3xl border border-border/70 bg-card/80 p-6 shadow-card lg:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Workday
            </p>
            <h1 className="mt-2 text-xl font-display text-foreground">
              {active?.workspace?.name ?? "Workspace"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {active?.membership?.role ?? "member"}
            </p>
          </div>
          <SidebarNav />
          <div className="mt-auto">
            <UserMenu name={session.name} />
          </div>
        </aside>

        <main className="min-h-[70vh] rounded-3xl border border-border/70 bg-card/90 p-6 shadow-card">
          {children}
        </main>

        <aside className="hidden flex-col gap-6 lg:flex">
          <RightRail />
        </aside>
      </div>
    </div>
  );
}

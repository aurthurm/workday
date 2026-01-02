import { redirect } from "next/navigation";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { SidebarNav, MobileNav, UserMenu } from "@/components/nav";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

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
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto grid w-full max-w-none gap-6 px-6 pb-24 pt-8 lg:grid-cols-[240px_1fr_280px]">
        <aside className="hidden flex-col gap-6 rounded-3xl border border-ink-200/70 bg-white/80 p-6 shadow-card lg:flex">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
              Workday
            </p>
            <h1 className="mt-2 text-xl font-display text-ink-900">
              {active?.workspace?.name ?? "Workspace"}
            </h1>
            <p className="text-xs text-ink-500">
              {active?.membership?.role ?? "member"}
            </p>
          </div>
          <SidebarNav />
        </aside>

        <main className="min-h-[70vh] rounded-3xl border border-ink-200/70 bg-white/90 p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-100 pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-ink-500">
                Daily work visibility
              </p>
              <h2 className="mt-2 text-2xl font-display text-ink-900">
                Keep work visible without the pressure
              </h2>
            </div>
            <UserMenu name={session.name} />
          </div>
          <div className="mt-6">{children}</div>
        </main>

        <aside className="hidden flex-col gap-6 lg:flex">
          <WorkspaceSwitcher />
          <div className="rounded-2xl border border-ink-200/70 bg-white/80 p-5 shadow-inset">
            <h3 className="text-sm font-semibold text-ink-800">
              Guiding principle
            </h3>
            <p className="mt-2 text-sm text-ink-600">
              Make work visible without making people feel watched. Use this
              space to encourage, not to control.
            </p>
          </div>
        </aside>
      </div>
      <MobileNav />
    </div>
  );
}

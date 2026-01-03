import { redirect } from "next/navigation";
import { getSession, getWorkspaceCookie } from "@/lib/auth";
import { getActiveWorkspace } from "@/lib/data";
import { SidebarShell } from "@/components/sidebar-shell";
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
    <div className="h-screen w-full overflow-hidden bg-background">
      <ThemeSync />
      <div className="flex h-full w-full">
        <SidebarShell
          name={session.name}
          workspaceName={active?.workspace?.name ?? "Workspace"}
          role={active?.membership?.role ?? "member"}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="h-full overflow-auto p-6">
            {children}
          </div>
        </main>

        <div className="relative hidden lg:flex">
          <RightRail />
        </div>
      </div>
    </div>
  );
}

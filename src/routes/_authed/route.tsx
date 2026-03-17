import { getCookieFn, getSession, signOut } from "@/actions/user";
import { AppSidebar, userQuery } from "@/components/app-sidebar";
import { MobileNavbar } from "@/components/mobile-navbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/_authed")({
  component: RouteComponent,
  beforeLoad: async ({ context }) => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return session;
  },
});

function RouteComponent() {
  //   const { sidebarOpen } = Route.useLoaderData();
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <SidebarProvider defaultOpen={true}>
        <Suspense fallback={<div>Loading...</div>}>
          <AppSidebar />
        </Suspense>
        <SidebarInset>
          <div className="h-[100svh] overflow-y-auto bg-[#efeeef]">
            <div className="w-full max-w-full min-w-0 pb-20 md:pb-0 overflow-x-hidden">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
        <MobileNavbar />
      </SidebarProvider>
    </div>
  );
}

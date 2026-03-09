"use client";

import { usePathname } from "next/navigation";
import Navigation from "@/components/navigation";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Bell } from "lucide-react";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show navigation on auth pages, public verification pages, or setup
  const isAuthPage = pathname.startsWith('/auth/');
  const isVerifyPage = pathname.startsWith('/verify/');
  const isSetupPage = pathname === '/setup';

  if (isAuthPage || isVerifyPage || isSetupPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-50">
        <Navigation />
        <main className="flex-1 flex flex-col">
          <header className="bg-white border-b border-slate-200 px-6 py-4 md:hidden">
            <div className="flex items-center justify-between">
              <SidebarTrigger className="hover:bg-slate-100 p-2 rounded-lg transition-colors duration-200" />
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Settings, Package, Users, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOwner as checkIsOwner } from "@/lib/permissions";

const adminNavItems = [
  {
    title: "Settings",
    href: "/admin/settings",
    icon: Settings,
  },
  {
    title: "Asset Types",
    href: "/admin/asset-types",
    icon: Package,
  },
  {
    title: "Users",
    href: "/admin/users",
    icon: Users,
  },
  {
    title: "Jobs",
    href: "/admin/jobs",
    icon: ListTodo,
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isOwnerUser = checkIsOwner(session?.user?.role);

  useEffect(() => {
    if (!isPending && !isOwnerUser) {
      router.replace("/dashboard");
    }
  }, [isPending, isOwnerUser, router]);

  if (isPending || !isOwnerUser) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Admin Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
          <p className="text-slate-600 text-sm mt-1">Manage global application settings</p>
        </div>
      </div>

      {/* Admin Subnav */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8">
            {adminNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-1 py-4 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Admin Content */}
      <div className="max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}

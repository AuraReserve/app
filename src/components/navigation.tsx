"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { LayoutDashboard, Building2, BarChart3, Users, Settings, ArrowLeft, ShieldCheck, FileText, ChevronRight, ArrowDownToLine, ArrowUpFromLine, UsersRound, ScrollText, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { isAdmin as checkIsAdmin, isOwner as checkIsOwner } from "@/lib/permissions";

type NavigationItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  isActive?: (pathname: string, params: ReadonlyURLSearchParams) => boolean;
};

type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

// Main navigation (when not in a space)
const mainNavigationItems: NavigationItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Spaces",
    url: "/spaces",
    icon: Building2,
  },
  {
    title: "Audit Logs",
    url: "/audit-logs",
    icon: FileText,
  },
  {
    title: "Admin",
    url: "/admin/settings",
    icon: ShieldCheck,
    ownerOnly: true,
    isActive: (pathname) => pathname.startsWith('/admin')
  },
];

interface SpaceNavigationContext {
  slug?: string;
  id?: string;
}

// Space navigation (when inside a space) — organized into sections
const getSpaceNavigationSections = (space: SpaceNavigationContext): NavigationSection[] => {
  const slug = space.slug;

  return [
    {
      label: "Navigation",
      items: [
        {
          title: "Dashboard",
          url: slug ? `/spaces/${slug}` : '/spaces',
          icon: LayoutDashboard,
          isActive: (pathname) => {
            return slug
              ? pathname === `/spaces/${slug}`
              : pathname === '/spaces';
          },
        },
        {
          title: "Reserves",
          url: slug ? `/spaces/${slug}/reserves` : '/spaces',
          icon: ShieldCheck,
          isActive: (pathname) => (slug ? pathname.startsWith(`/spaces/${slug}/reserves`) : false),
        },
        {
          title: "Data Inputs",
          url: slug ? `/spaces/${slug}/input` : '/spaces',
          icon: ArrowDownToLine,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/input` : false),
        },
        {
          title: "Data Outputs",
          url: slug ? `/spaces/${slug}/output` : '/spaces',
          icon: ArrowUpFromLine,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/output` : false),
        },
        {
          title: "Analytics",
          url: slug ? `/spaces/${slug}/analytics` : '/spaces',
          icon: BarChart3,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/analytics` : false),
        },
      ],
    },
    {
      label: "Space",
      items: [
        {
          title: "Members",
          url: slug ? `/spaces/${slug}/members` : '/spaces',
          icon: Users,
          adminOnly: true,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/members` : false),
        },
        {
          title: "Groups",
          url: slug ? `/spaces/${slug}/groups` : '/spaces',
          icon: UsersRound,
          adminOnly: true,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/groups` : false),
        },
        {
          title: "Activity Log",
          url: slug ? `/spaces/${slug}/activity` : '/spaces',
          icon: Activity,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/activity` : false),
        },
        {
          title: "Audit Log",
          url: slug ? `/spaces/${slug}/audit-logs` : '/spaces',
          icon: ScrollText,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/audit-logs` : false),
        },
        {
          title: "Settings",
          url: slug ? `/spaces/${slug}/settings` : '/spaces',
          icon: Settings,
          adminOnly: true,
          isActive: (pathname) => (slug ? pathname === `/spaces/${slug}/settings` : false),
        },
      ],
    },
  ];
};

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [spaceName, setSpaceName] = useState("");
  const [spaceMeta, setSpaceMeta] = useState<(SpaceNavigationContext & { name: string }) | null>(null);

  const user = session?.user;

  // Determine if we're in a space context
  const spaceSlugFromPath = pathname.startsWith("/spaces/")
    ? pathname.split("/")[2] || undefined
    : undefined;
  const spaceIdFromQuery = searchParams.get("space") || searchParams.get("space_id");
  const spaceKey = spaceSlugFromPath || spaceIdFromQuery;

  const isInSpaceContext = !!spaceSlugFromPath;

  // Load space name if in space context
  useEffect(() => {
    const loadSpaceDetails = async () => {
      if (!spaceKey || !isInSpaceContext) {
        setSpaceName("");
        setSpaceMeta(null);
        return;
      }

      try {
        const { Space } = await import("@/lib/entities");
        let record: (SpaceNavigationContext & { name: string }) | null = null;

        if (spaceSlugFromPath) {
          const spaces = await Space.filter({ slug: spaceSlugFromPath });
          record = spaces.length > 0 ? spaces[0] : null;
        } else if (spaceIdFromQuery) {
          const spaces = await Space.filter({ id: spaceIdFromQuery });
          record = spaces.length > 0 ? spaces[0] : null;
        }

        if (record) {
          setSpaceName(record.name);
          setSpaceMeta({ id: record.id, slug: record.slug, name: record.name });
        } else {
          setSpaceName("");
          setSpaceMeta(null);
        }
      } catch (error) {
        console.error("Error loading space metadata:", error);
        setSpaceName("");
        setSpaceMeta(null);
      }
    };

    loadSpaceDetails();
  }, [spaceKey, spaceSlugFromPath, spaceIdFromQuery, isInSpaceContext]);

  const spaceSections = isInSpaceContext
    ? getSpaceNavigationSections({
        slug: spaceMeta?.slug || spaceSlugFromPath || undefined,
        id: spaceMeta?.id || spaceIdFromQuery || undefined,
      })
    : null;

  // Check if user has platform-level admin privileges
  const isPlatformAdmin = checkIsAdmin(user?.role);
  const isOwner = checkIsOwner(user?.role);

  // Check if user is admin in the current space context
  // Platform admins/owners are implicitly admin in all spaces
  const isSpaceAdmin = useMemo(() => {
    if (isPlatformAdmin || isOwner) return true;
    if (!spaceMeta?.id) return false;
    const spaces = (user as Record<string, unknown> | undefined)?.spaces as
      | Array<{ spaceId: string; role: string }>
      | undefined;
    if (!spaces) return false;
    const membership = spaces.find((s) => s.spaceId === spaceMeta.id);
    return membership?.role === "admin";
  }, [isPlatformAdmin, isOwner, spaceMeta?.id, user]);

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar-background flex flex-col sticky top-0 h-screen">
      {/* Header with logo */}
      <SidebarHeader className="border-b border-sidebar-border p-5">
        <Link href="/" className="group">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
              <Image
                src="/icon_gold.svg"
                alt="AuraReserve"
                width={28}
                height={28}
                priority
              />
            </div>
            <div>
              <h2 className="text-base font-bold text-sidebar-foreground">AuraReserve</h2>
              <p className="text-xs text-sidebar-foreground/50 font-medium">Reserve Platform</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="p-3 flex-1 overflow-y-auto">
        {/* Space context indicator */}
        {isInSpaceContext && (
          <div className="mb-4 space-y-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/spaces")}
              className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent h-9 px-3"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="text-sm">All Spaces</span>
            </Button>

            {spaceName && (
              <div className="mx-1 p-3 bg-gradient-to-br from-amber-500/10 to-yellow-500/5 rounded-xl border border-amber-500/20">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-amber-400/80 font-semibold mb-0.5">
                      Current Space
                    </p>
                    <p className="text-sm font-semibold text-sidebar-foreground truncate">
                      {spaceName}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0 ml-2">
                    <Building2 className="w-4 h-4 text-amber-400" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation items */}
        {isInSpaceContext && spaceSections ? (
          spaceSections.map((section) => {
            const visibleItems = section.items.filter((item) => {
              if (item.adminOnly && !isSpaceAdmin) return false;
              if (item.ownerOnly && !isOwner) return false;
              return true;
            });
            if (visibleItems.length === 0) return null;

            return (
              <SidebarGroup key={section.label}>
                <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 py-2">
                  {section.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {visibleItems.map((item) => {
                      const active = item.isActive
                        ? item.isActive(pathname, searchParams)
                        : pathname === item.url || pathname.startsWith(item.url + '/');

                      return (
                        <SidebarMenuItem key={item.title}>
                          <Link href={item.url} className="block">
                            <SidebarMenuButton
                              isActive={active}
                              className={`
                                group/item relative rounded-lg px-3 py-2.5
                                transition-all duration-200
                                ${active
                                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-amber-500'
                                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                                }
                              `}
                            >
                              <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${active ? 'text-amber-500' : 'group-hover/item:scale-110'}`} />
                              <span className="text-sm font-medium truncate">{item.title}</span>
                              {active && (
                                <ChevronRight className="w-4 h-4 opacity-60 ml-auto shrink-0" />
                              )}
                            </SidebarMenuButton>
                          </Link>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider px-3 py-2">
              Platform
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {mainNavigationItems.map((item, index) => {
                  if (item.adminOnly && !isPlatformAdmin) return null;
                  if (item.ownerOnly && !isOwner) return null;

                  const active = item.isActive
                    ? item.isActive(pathname, searchParams)
                    : pathname === item.url || pathname.startsWith(item.url + '/');

                  return (
                    <SidebarMenuItem
                      key={item.title}
                      className="animate-slide-in-left"
                      style={{ animationDelay: `${index * 0.03}s`, animationFillMode: 'forwards', opacity: 0 }}
                    >
                      <Link href={item.url} className="block">
                        <SidebarMenuButton
                          isActive={active}
                          className={`
                            group/item relative rounded-lg px-3 py-2.5
                            transition-all duration-200
                            ${active
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium border-l-2 border-amber-500'
                              : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                            }
                          `}
                        >
                          <item.icon className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${active ? 'text-amber-500' : 'group-hover/item:scale-110'}`} />
                          <span className="text-sm font-medium truncate">{item.title}</span>
                          {active && (
                            <ChevronRight className="w-4 h-4 opacity-60 ml-auto shrink-0" />
                          )}
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with user menu */}
      <SidebarFooter className="border-t border-sidebar-border p-3 mt-auto">
        {user && (
          <div className="flex items-center gap-3 w-full">
            <UserMenu />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

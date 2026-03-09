"use client";

import React, { useState } from "react";
import { Space } from "@/lib/entities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Building2, Sparkles } from "lucide-react";
import CreateSpaceDialog from "@/components/spaces/create-space-dialog";
import { SpaceCard } from "@/components/spaces/space-card";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { refreshSession } from "@/lib/auth-client";

export default function Spaces() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // Load spaces using useAsyncData hook
  const {
    data: spacesData,
    isLoading,
    reload: reloadSpaces,
  } = useAsyncData({
    fetchFn: () => Space.list('-created_date'),
  });

  const { user, permissions } = useCurrentUser();

  const spaces = spacesData ?? [];
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const handleSpaceCreated = () => {
    reloadSpaces();
    setShowCreateDialog(false);
    // Refresh session so user.spaces includes the new space membership,
    // ensuring navigation items like "Members" appear immediately
    refreshSession();
  };

  const hasCreatePermission = permissions.canCreateSpaces;
  const isSaasMode = process.env.NEXT_PUBLIC_SELF_HOSTED !== "true";
  const showBecomeCreator = !hasCreatePermission && isSaasMode && user;

  const handleBecomeCreator = async () => {
    setIsUpgrading(true);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/user/become-creator", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upgrade account");
      }
      // Reload the page to refresh session with new permissions
      window.location.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setUpgradeError(message);
      setIsUpgrading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-radial">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 opacity-0 animate-fade-up"
          style={{ animationFillMode: 'forwards' }}
        >
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Building2 className="w-4 h-4" />
              <span>Asset Management</span>
            </div>
            <h1 className="text-4xl font-bold text-foreground tracking-tight">Spaces</h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Manage your asset tracking spaces and proof-of-reserve systems
            </p>
          </div>

          {hasCreatePermission && (
            <Button
              onClick={() => setShowCreateDialog(true)}
              size="lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Space
            </Button>
          )}

          {showBecomeCreator && (
            <Button
              onClick={handleBecomeCreator}
              size="lg"
              disabled={isUpgrading}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isUpgrading ? "Setting up..." : "Start Creating Spaces"}
            </Button>
          )}
        </div>

        {upgradeError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {upgradeError}
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Card
                key={i}
                className="overflow-hidden opacity-0 animate-fade-up"
                style={{
                  animationDelay: `${i * 0.05}s`,
                  animationFillMode: 'forwards'
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="h-5 w-3/4 rounded-md animate-shimmer"></div>
                      <div className="h-4 w-1/2 rounded-md animate-shimmer"></div>
                    </div>
                    <div className="h-10 w-10 rounded-xl animate-shimmer"></div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-4 w-full rounded-md animate-shimmer"></div>
                    <div className="h-4 w-2/3 rounded-md animate-shimmer"></div>
                    <div className="flex gap-2 mt-4">
                      <div className="h-6 w-16 rounded-full animate-shimmer"></div>
                      <div className="h-6 w-20 rounded-full animate-shimmer"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div
            className="text-center py-24 opacity-0 animate-scale-in"
            style={{ animationFillMode: 'forwards' }}
          >
            <div className="relative inline-block mb-8">
              {/* Decorative background */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-yellow-500/10 rounded-3xl blur-2xl scale-150" />
              <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center">
                <Building2 className="w-12 h-12 text-slate-400" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-foreground mb-3">No spaces yet</h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto text-lg">
              Create your first space to start tracking proof-of-reserve data for your assets
            </p>

            {hasCreatePermission && (
              <Button
                onClick={() => setShowCreateDialog(true)}
                size="lg"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Create Your First Space
              </Button>
            )}

            {showBecomeCreator && (
              <Button
                onClick={handleBecomeCreator}
                size="lg"
                disabled={isUpgrading}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isUpgrading ? "Setting up..." : "Start Creating Spaces"}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {spaces.map((space, index) => (
              <div
                key={space.id}
                className="opacity-0 animate-fade-up"
                style={{
                  animationDelay: `${index * 0.05}s`,
                  animationFillMode: 'forwards'
                }}
              >
                <SpaceCard space={space} />
              </div>
            ))}
          </div>
        )}

        <CreateSpaceDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSpaceCreated={handleSpaceCreated}
        />
      </div>
    </div>
  );
}

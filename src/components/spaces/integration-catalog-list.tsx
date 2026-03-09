"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface CatalogIntegration {
  id: string;
  key: string;
  displayName: string;
  description: string;
  supportsInput: boolean;
  supportsOutput: boolean;
  supportedArtifactTypes: string[];
  isFree: boolean;
  supportedTriggers: string[];
  activated: boolean;
}

interface IntegrationCatalogListProps {
  catalog: CatalogIntegration[];
  direction: "input" | "output";
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  spaceId: string;
  onSelect: (key: string) => void;
  setError: (msg: string | null) => void;
}

export function IntegrationCatalogList({
  catalog,
  direction,
  csrfFetch,
  spaceId,
  onSelect,
  setError,
}: IntegrationCatalogListProps) {
  const [activating, setActivating] = useState<string | null>(null);
  const [localCatalog, setLocalCatalog] = useState(catalog);

  useEffect(() => { setLocalCatalog(catalog); }, [catalog]);

  const handleActivate = async (key: string) => {
    setActivating(key);
    try {
      const res = await csrfFetch(`/api/spaces/${spaceId}/integrations/marketplace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationKey: key }),
      });
      if (res.ok) {
        setLocalCatalog((prev) =>
          prev.map((c) => (c.key === key ? { ...c, activated: true } : c))
        );
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to activate integration.");
      }
    } catch {
      setError("Failed to activate integration.");
    }
    setActivating(null);
  };

  const filtered = localCatalog.filter((c) =>
    direction === "input" ? c.supportsInput : c.supportsOutput
  );

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No {direction} integrations available.
      </p>
    );
  }

  return (
    <div className="space-y-2 py-2">
      {filtered.map((integration) => (
        <div
          key={integration.key}
          className={`w-full text-left border rounded-lg p-4 transition-colors space-y-1 ${
            integration.activated
              ? "hover:bg-slate-50 cursor-pointer"
              : "opacity-60"
          }`}
          onClick={() =>
            integration.activated && onSelect(integration.key)
          }
          role={integration.activated ? "button" : undefined}
        >
          <div className="flex items-center justify-between">
            <span className={`font-medium ${integration.activated ? "text-slate-900" : "text-slate-500"}`}>
              {integration.displayName}
            </span>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              {!integration.activated && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7"
                  disabled={activating === integration.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActivate(integration.key);
                  }}
                >
                  {activating === integration.key ? "Activating..." : "Activate"}
                </Button>
              )}
              <Badge variant="secondary" className="text-xs">
                {integration.isFree ? "Free" : "Premium"}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-slate-500">{integration.description}</p>
        </div>
      ))}
    </div>
  );
}

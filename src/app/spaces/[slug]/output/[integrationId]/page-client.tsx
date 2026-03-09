"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { generateApiIdentifier } from "@/lib/utils";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { TRIGGER_LABELS } from "@/constants/integrations";
import { AlertMessages } from "@/components/common/alert-messages";
import {
  SpacePageSkeleton,
  SpaceNotFound,
  AccessRestricted,
} from "@/components/spaces/space-page-shell";
import { STATUS_DOT_COLORS } from "@/lib/artifact-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ClipboardButton } from "@/components/clipboardbutton";
import { Space as SpaceEntity } from "@/lib/entities";
import type { Space as SpaceType } from "@/lib/entities/types";
import {
  IntegrationConfigFieldsWithDirection,
  hasConfigFields,
} from "@/components/integrations/integration-config-fields";
import type { IntegrationConfig } from "@/components/integrations/integration-config-fields";
import {
  ArrowLeft,
  Circle,
  Clock,
  Play,
  Send,
  Settings,
  CheckCircle2,
  XCircle,
  Key,
  Trash2,
  Plus,
  Copy,
  Check,
  AlertCircle,
  Globe,
  Lock,
  Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunLog {
  id: string;
  status: string;
  message: string | null;
  durationMs: number | null;
  createdDate: string;
}

interface DataOutputItem {
  id: string;
  spaceId: string;
  integrationId: string;
  streamId: string;
  direction: string;
  status: string;
  config: Record<string, unknown>;
  schedule: string | null;
  trigger: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdDate: string;
  integration: {
    id: string;
    key: string;
    displayName: string;
    description: string;
    supportsInput: boolean;
    supportsOutput: boolean;
    isFree: boolean;
    supportedTriggers: string[];
    configSchema: Record<string, unknown>;
  };
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    isActive: boolean;
  };
  runLogs: RunLog[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// API key record shape from the integration-level route
interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  usageCount: number;
  lastUsed: string | null;
  createdDate: string;
  plaintextKey?: string;
}

// ---------------------------------------------------------------------------
// API Serve Section (endpoint, keys, usage examples)
// ---------------------------------------------------------------------------

function ApiServeSection({
  space,
  slug: _slug,
  streamSlug,
  integrationKey,
  canManageKeys,
  outputId,
  outputConfig,
  onConfigUpdated,
}: {
  space: SpaceType;
  slug: string;
  streamSlug: string | null;
  integrationKey: string;
  canManageKeys: boolean;
  outputId: string;
  outputConfig: Record<string, unknown>;
  onConfigUpdated: (config: Record<string, unknown>) => void;
}) {
  const [spaceData, setSpaceData] = useState(space);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isUpdatingIdentifier, setIsUpdatingIdentifier] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [isPublic, setIsPublic] = useState(!!outputConfig.isPublic);
  const [isTogglingAccess, setIsTogglingAccess] = useState(false);
  const { user: currentUser } = useCurrentUser();

  const handleToggleAccess = async (newValue: boolean) => {
    setIsTogglingAccess(true);
    setError(null);
    setInfoMessage(null);
    try {
      const res = await fetch(
        `/api/spaces/${spaceData.id}/data-outputs/${outputId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: { isPublic: newValue } }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update access mode.");
        return;
      }
      setIsPublic(newValue);
      const updated = await res.json();
      onConfigUpdated(updated.config ?? {});
      setInfoMessage(
        newValue
          ? "API access set to public. No API key required."
          : "API access set to restricted. An API key is now required."
      );
    } catch {
      setError("Failed to update access mode.");
    } finally {
      setIsTogglingAccess(false);
    }
  };

  useEffect(() => {
    const loadKeys = async () => {
      setIsLoadingKeys(true);
      try {
        const res = await fetch(`/api/spaces/${spaceData.id}/integrations/${outputId}/keys`);
        if (res.ok) {
          setApiKeys(await res.json());
        } else {
          setError("Failed to load API keys.");
        }
      } catch {
        setError("Failed to load API keys.");
      }
      setIsLoadingKeys(false);
    };
    loadKeys();
  }, [spaceData.id, outputId]);

  const loadApiKeys = async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceData.id}/integrations/${outputId}/keys`);
      if (res.ok) {
        setApiKeys(await res.json());
      }
    } catch {
      setError("Failed to load API keys.");
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setError(null);
    if (!currentUser?.id) {
      setError("You must be signed in to create API keys.");
      return;
    }
    try {
      const res = await fetch(
        `/api/spaces/${spaceData.id}/integrations/${outputId}/keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newKeyName.trim() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create API key.");
        return;
      }
      const created: ApiKeyRecord = await res.json();
      setNewKeyName("");
      setNewlyCreatedKey(created.plaintextKey ?? null);
      setShowNewKeyDialog(true);
      await loadApiKeys();
    } catch {
      setError("Failed to create API key.");
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/spaces/${spaceData.id}/integrations/${outputId}/keys`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: keyId }),
        }
      );
      if (!res.ok) {
        setError("Failed to delete API key.");
        return;
      }
      setApiKeys((prev) => prev.filter((key) => key.id !== keyId));
    } catch {
      setError("Failed to delete API key.");
    }
  };

  const handleUseSlugIdentifier = async () => {
    if (spaceData.api_identifier_source === "slug") return;
    setError(null);
    setInfoMessage(null);
    setIsUpdatingIdentifier(true);
    try {
      const updated = await SpaceEntity.update(spaceData.id, {
        api_identifier_source: "slug",
        api_identifier: spaceData.slug,
      });
      if (updated) {
        setSpaceData(updated);
        setInfoMessage("Endpoint updated to use the space slug.");
      }
    } catch {
      setError("Failed to switch endpoint to the space slug.");
    } finally {
      setIsUpdatingIdentifier(false);
    }
  };

  const handleGenerateCustomIdentifier = async () => {
    const newIdentifier = `space_${generateApiIdentifier()}`;
    setError(null);
    setInfoMessage(null);
    setIsUpdatingIdentifier(true);
    try {
      const updated = await SpaceEntity.update(spaceData.id, {
        api_identifier_source: "custom",
        api_identifier: newIdentifier,
      });
      if (updated) {
        setSpaceData(updated);
        setInfoMessage("Generated a new private endpoint identifier. Update any client integrations.");
      }
    } catch {
      setError("Failed to generate a new endpoint identifier.");
    } finally {
      setIsUpdatingIdentifier(false);
    }
  };

  const getBaseUrl = () => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/v1/reserves/${spaceData.api_identifier}`;
  };

  const getApiUrl = () => {
    const base = getBaseUrl();
    if (!base) return "";
    // api-serve: single stream endpoint; api-serve-all: all streams
    if (integrationKey === "api-serve" && streamSlug) {
      return `${base}/streams/${streamSlug}`;
    }
    return `${base}/streams`;
  };

  const getUsageExamples = () => {
    const endpoint = getApiUrl();

    return {
      javascript: isPublic
        ? `// Public API - No authentication required
fetch('${endpoint}')
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`
        : `// Private API - Authentication required
fetch('${endpoint}', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY_HERE'
  }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));`,
      curl: isPublic
        ? `# Public API - No authentication required
curl ${endpoint}`
        : `# Private API - Authentication required
curl -H "Authorization: Bearer YOUR_API_KEY_HERE" \\
  ${endpoint}`,
      python: isPublic
        ? `# Public API - No authentication required
import requests

response = requests.get('${endpoint}')
data = response.json()
print(data)`
        : `# Private API - Authentication required
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY_HERE'
}
response = requests.get('${endpoint}', headers=headers)
data = response.json()
print(data)`,
    };
  };

  const copyNewKeyToClipboard = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopiedKey(newlyCreatedKey);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {infoMessage && (
        <Alert>
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription>{infoMessage}</AlertDescription>
        </Alert>
      )}

      {/* API Endpoint */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            API Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase text-slate-500">Current Endpoint</Label>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="font-mono text-sm bg-slate-900 text-slate-100 px-4 py-2 rounded-md break-all">
                {getApiUrl() || "Loading..."}
              </div>
              <ClipboardButton text={getApiUrl() || "Loading..."} />
            </div>
          </div>

          {canManageKeys && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-600">
                The endpoint currently uses the {spaceData.api_identifier_source === "slug" ? "space slug" : "private identifier"} (
                <span className="font-mono text-xs">{spaceData.api_identifier}</span>).
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUseSlugIdentifier}
                  disabled={spaceData.api_identifier_source === "slug" || isUpdatingIdentifier}
                >
                  Use Space Slug
                </Button>
                <Button
                  type="button"
                  onClick={handleGenerateCustomIdentifier}
                  disabled={isUpdatingIdentifier}
                >
                  {isUpdatingIdentifier ? "Updating..." : "Generate Private Identifier"}
                </Button>
              </div>
              {spaceData.api_identifier_source === "custom" ? (
                <p className="text-xs text-amber-600">
                  Share this identifier only with trusted clients. Regenerating it will immediately invalidate the previous endpoint.
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Using the space slug keeps the endpoint predictable but exposes it publicly. Switch to a private identifier for obscurity.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Access & Keys */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isPublic ? (
              <Globe className="w-5 h-5 text-green-600" />
            ) : (
              <Lock className="w-5 h-5 text-blue-600" />
            )}
            API Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManageKeys && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-0.5">
                <Label htmlFor="api-access-toggle" className="text-sm font-medium">
                  {isPublic ? "Public Access" : "Restricted Access"}
                </Label>
                <p className="text-xs text-slate-500">
                  {isPublic
                    ? "Anyone can access this endpoint without an API key."
                    : "An API key is required to access this endpoint."}
                </p>
              </div>
              <Switch
                id="api-access-toggle"
                checked={isPublic}
                onCheckedChange={handleToggleAccess}
                disabled={isTogglingAccess}
              />
            </div>
          )}

          {isPublic ? (
            <Alert className="bg-green-50 border-green-200">
              <Globe className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Public API access is enabled. No API key is required to access the endpoint.
              </AlertDescription>
            </Alert>
          ) : canManageKeys ? (
            <div className="flex flex-col md:flex-row gap-3">
              <Input
                placeholder="Key label (e.g. Production App)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="md:flex-1"
              />
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim() || isLoadingKeys}>
                <Plus className="w-4 h-4 mr-2" />
                Create Key
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              API keys are managed by space administrators.
            </p>
          )}

          {!isPublic && (
            <div className="space-y-4">
              {isLoadingKeys ? (
                <Skeleton className="h-32 w-full" />
              ) : apiKeys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                  <Key className="w-8 h-8 mx-auto text-slate-400 mb-3" />
                  <p className="text-slate-600">No API keys yet. Create one to get started.</p>
                </div>
              ) : (
                apiKeys.map((key) => (
                  <Card key={key.id} className="border border-slate-200">
                    <CardContent className="py-6 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                          <p className="text-sm uppercase text-slate-500">Key Name</p>
                          <p className="text-lg font-semibold text-slate-900">{key.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={key.isActive ? "default" : "secondary"}>
                            {key.isActive ? "Active" : "Inactive"}
                          </Badge>
                          <Badge variant="outline">{key.usageCount} calls</Badge>
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="font-mono text-sm bg-slate-100 text-slate-800 px-4 py-2 rounded-md">
                          {key.keyPrefix ?? "ar_"}••••••••••••••••
                        </div>
                        <div className="flex gap-2">
                          {canManageKeys && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteKey(key.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Examples */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            Integration Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-slate-500 uppercase mb-3">Usage Examples</p>
            <Tabs defaultValue="javascript" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>

              {(["javascript", "curl", "python"] as const).map((lang) => (
                <TabsContent key={lang} value={lang} className="mt-4">
                  <div className="relative">
                    <ClipboardButton className="absolute right-2 top-2 z-10" text={getUsageExamples()[lang]} />
                    <pre className="bg-slate-900 text-slate-100 text-sm p-4 rounded-md overflow-x-auto">
                      {getUsageExamples()[lang]}
                    </pre>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* New API Key Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={() => { setShowNewKeyDialog(false); setNewlyCreatedKey(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">API Key Created Successfully</DialogTitle>
                <DialogDescription className="mt-1">
                  Save this key in a secure location. It won&apos;t be shown again.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <strong>Important:</strong> For security reasons, we can only show you this key once. Make sure to copy it now.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Your API Key</Label>
              <div
                className="relative group cursor-pointer"
                onClick={copyNewKeyToClipboard}
                title="Click to copy"
              >
                <div className="font-mono text-sm bg-slate-900 text-slate-100 px-4 py-3 pr-12 rounded-lg break-all select-all hover:bg-slate-800 transition-colors">
                  {newlyCreatedKey}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-slate-700"
                  onClick={(e) => { e.stopPropagation(); copyNewKeyToClipboard(); }}
                >
                  {copiedKey === newlyCreatedKey ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </Button>
              </div>
              {copiedKey === newlyCreatedKey && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Copied to clipboard!
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => { setShowNewKeyDialog(false); setNewlyCreatedKey(null); }}
            >
              I&apos;ve Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OutputDetailClient({
  slug,
  integrationId,
}: {
  slug: string;
  integrationId: string;
}) {
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [output, setOutput] = useState<DataOutputItem | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const { error, success, setError, setSuccess } = useFormState();
  const { csrfFetch } = useCsrfFetch();

  const { permissions } = useSpacePermissions(space?.id);
  const { user } = useCurrentUser();
  const isPlatformAdmin = checkIsAdmin(user?.role);
  const canView = isPlatformAdmin || permissions.canViewData;
  const canTrigger = isPlatformAdmin || permissions.canTriggerOutput;
  const canManageKeys = isPlatformAdmin || permissions.canManageApiKeys;

  // ── Load output data ──────────────────────────────────────────────────

  const loadOutput = useCallback(async () => {
    if (!space?.id) return;
    setDataLoading(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/data-outputs`);
      if (res.ok) {
        const all: DataOutputItem[] = await res.json();
        const found = all.find((o) => o.id === integrationId);
        setOutput(found ?? null);
      }
    } catch {
      setError("Failed to load data output.");
    }
    setDataLoading(false);
  }, [space?.id, integrationId, setError]);

  useEffect(() => {
    loadOutput();
  }, [loadOutput]);

  // ── Run output ───────────────────────────────────────────────────────

  const [triggering, setTriggering] = useState(false);
  const [showEditConfig, setShowEditConfig] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const handleToggleStatus = async () => {
    if (!output || !space) return;
    const newStatus = output.status.toLowerCase() === "active" ? "inactive" : "active";
    setTogglingStatus(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-outputs/${output.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update status.");
      } else {
        setSuccess(`Output ${newStatus === "active" ? "activated" : "deactivated"} successfully.`);
        loadOutput();
      }
    } catch {
      setError("Failed to update status.");
    }
    setTogglingStatus(false);
  };

  const handleRunOutput = async () => {
    if (!output || !space) return;
    setTriggering(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-outputs/${output.id}/run`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.message || `Run failed (HTTP ${res.status})`);
      } else if (data.success) {
        setSuccess(
          data.message
            ? `${data.message} (${data.durationMs}ms)`
            : `Output run completed in ${data.durationMs}ms`
        );
        loadOutput(); // refresh run logs
      } else {
        setError(data.message || data.error || "Output run failed.");
      }
    } catch {
      setError("Failed to trigger output run.");
    }
    setTriggering(false);
  };

  // ── Guards ────────────────────────────────────────────────────────────

  if (spaceLoading || dataLoading) return <SpacePageSkeleton />;
  if (!space) return <SpaceNotFound slug={slug} />;
  if (!canView) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space.name}
        backHref={`/spaces/${slug}/output`}
        message="You do not have access to this data output."
      />
    );
  }
  if (!output) {
    return (
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <Link href={`/spaces/${slug}/output`}>
            <Button variant="ghost" className="w-fit">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Data Output
            </Button>
          </Link>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Data output not found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const normalizedStatus = output.status.toLowerCase();
  const statusDotColor = STATUS_DOT_COLORS[normalizedStatus] ?? STATUS_DOT_COLORS[output.status] ?? "text-slate-300";
  const isActive = normalizedStatus === "active";
  const isApiServe = output.integration.key === "api-serve" || output.integration.key === "api-serve-all";
  const isWebhook = output.integration.key === "webhook";
  const canManageOutputs = isPlatformAdmin || permissions.canManageOutputs;
  const showConfig = hasConfigFields(output.integration.key);

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href={`/spaces/${slug}/output`}>
          <Button variant="ghost" className="w-fit">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Data Output
          </Button>
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-2">
            {output.integration.displayName}
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Circle
                className={`w-2.5 h-2.5 fill-current ${statusDotColor}`}
              />
              <span className="capitalize">{normalizedStatus}</span>
            </span>
            <span>Source: {output.stream.name}</span>
            {output.trigger && (
              <span>
                Trigger:{" "}
                {TRIGGER_LABELS[output.trigger.toLowerCase()] ?? output.trigger}
              </span>
            )}
          </div>
        </div>

        <AlertMessages error={error} success={success} />

        {/* API Serve: full endpoint + key management + usage examples */}
        {isApiServe && (
          <ApiServeSection
            space={space}
            slug={slug}
            streamSlug={output.stream?.slug ?? null}
            integrationKey={output.integration.key}
            canManageKeys={canManageKeys}
            outputId={output.id}
            outputConfig={output.config as Record<string, unknown>}
            onConfigUpdated={(config) =>
              setOutput((prev) =>
                prev ? { ...prev, config } : prev
              )
            }
          />
        )}

        {/* Non-API-serve: tabbed Data + Configuration layout */}
        {!isApiServe && (
          <Tabs defaultValue="data" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="space-y-6 mt-6">
              {/* Actions */}
              {canTrigger && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex gap-3">
                    <Button
                      onClick={handleRunOutput}
                      disabled={triggering || !isActive}
                    >
                      {isWebhook ? (
                        <Send className="w-4 h-4 mr-1" />
                      ) : (
                        <Play className="w-4 h-4 mr-1" />
                      )}
                      {triggering
                        ? "Running..."
                        : isWebhook
                          ? "Send Webhook"
                          : "Run Now"}
                    </Button>
                    {!isActive && (
                      <p className="text-sm text-muted-foreground self-center">
                        Output is inactive. Activate it in the Configuration tab to run.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Run History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Run History</CardTitle>
                </CardHeader>
                <CardContent>
                  {output.runLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No runs recorded yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-slate-500">
                            <th className="pb-2 pr-4 font-medium">Timestamp</th>
                            <th className="pb-2 pr-4 font-medium">Status</th>
                            <th className="pb-2 pr-4 font-medium">Duration</th>
                            <th className="pb-2 font-medium">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {output.runLogs.map((log) => (
                            <tr
                              key={log.id}
                              className="border-b last:border-0 hover:bg-slate-50"
                            >
                              <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">
                                {new Date(log.createdDate).toLocaleString()}
                              </td>
                              <td className="py-2.5 pr-4">
                                <span className="flex items-center gap-1.5">
                                  {log.status === "success" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                  )}
                                  <span className="capitalize">{log.status}</span>
                                </span>
                              </td>
                              <td className="py-2.5 pr-4 text-slate-600">
                                {log.durationMs !== null
                                  ? `${log.durationMs}ms`
                                  : "--"}
                              </td>
                              <td className="py-2.5 text-slate-500 truncate max-w-[300px]">
                                {log.message || "--"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="configuration" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Configuration
                    </CardTitle>
                    {canManageOutputs && showConfig && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEditConfig(true)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Edit Configuration
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-6">
                    <div>
                      <span className="text-slate-500">Integration</span>
                      <p className="font-medium">{output.integration.displayName}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Source Stream</span>
                      <p className="font-medium">{output.stream.name}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Trigger</span>
                      <p className="font-medium">
                        {output.trigger
                          ? TRIGGER_LABELS[output.trigger.toLowerCase()] ??
                            output.trigger
                          : "--"}
                      </p>
                    </div>
                    {output.schedule && (
                      <div>
                        <span className="text-slate-500">Schedule</span>
                        <p className="font-mono text-xs">{output.schedule}</p>
                      </div>
                    )}
                    {output.lastRunAt && (
                      <div>
                        <span className="text-slate-500">Last Run</span>
                        <p className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(output.lastRunAt), {
                            addSuffix: true,
                          })}
                          {output.lastRunStatus && (
                            <Badge variant="outline" className="text-xs ml-1">
                              {output.lastRunStatus}
                            </Badge>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Show config as proper form fields (read-only) */}
                  {showConfig && Object.keys(output.config).length > 0 && (
                    <div className="border-t pt-4">
                      <IntegrationConfigFieldsWithDirection
                        integrationKey={output.integration.key}
                        direction="output"
                        config={output.config as IntegrationConfig}
                        onChange={() => {}}
                        readOnly
                      />
                    </div>
                  )}

                  {/* Activate / Deactivate */}
                  {canManageOutputs && (
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium">
                            {isActive ? "Active" : "Inactive"}
                          </Label>
                          <p className="text-xs text-slate-500">
                            {isActive
                              ? "This output is active and will process triggers."
                              : "This output is deactivated and will not process triggers."}
                          </p>
                        </div>
                        <Switch
                          checked={isActive}
                          onCheckedChange={handleToggleStatus}
                          disabled={togglingStatus}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Edit Configuration Dialog */}
        {!isApiServe && showConfig && (
          <EditOutputConfigDialog
            open={showEditConfig}
            onOpenChange={setShowEditConfig}
            spaceId={space.id}
            output={output}
            onSaved={() => {
              setShowEditConfig(false);
              setSuccess("Configuration updated successfully.");
              loadOutput();
            }}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Output Config Dialog
// ---------------------------------------------------------------------------

function EditOutputConfigDialog({
  open,
  onOpenChange,
  spaceId,
  output,
  onSaved,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  output: DataOutputItem;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const [configData, setConfigData] = useState<IntegrationConfig>(
    (output.config as IntegrationConfig) || {}
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/data-outputs/${output.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: configData }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update configuration.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError("Failed to update configuration.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {output.integration.displayName} Configuration</DialogTitle>
          <DialogDescription>
            Update the configuration for this integration.
          </DialogDescription>
        </DialogHeader>

        <IntegrationConfigFieldsWithDirection
          integrationKey={output.integration.key}
          direction="output"
          config={configData}
          onChange={setConfigData}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

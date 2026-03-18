"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { AlertMessages } from "@/components/common/alert-messages";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyStateCard } from "@/components/common/empty-state-card";
import { SpacePageHeader } from "@/components/spaces/space-page-header";
import {
  SpacePageSkeleton,
  SpaceNotFound,
  AccessRestricted,
} from "@/components/spaces/space-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  IntegrationConfigFieldsWithDirection,
  hasConfigFields,
} from "@/components/integrations/integration-config-fields";
import { CronScheduleInput } from "@/components/integrations/cron-schedule-input";
import type { IntegrationConfig } from "@/components/integrations/integration-config-fields";
import {
  Upload,
  Plus,
  ChevronRight,
  Clock,
  Pencil,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getTriggerLabel, TRIGGER_LABELS } from "@/constants/integrations";

import {
  IntegrationCatalogList,
  type CatalogIntegration,
} from "@/components/spaces/integration-catalog-list";

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
  streamId: string | null;
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
  } | null;
  runLogs: RunLog[];
}

/** Minimal data input shape used for source dropdown */
interface DataInputSummary {
  id: string;
  streamId: string;
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    isActive: boolean;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataOutputPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [outputs, setOutputs] = useState<DataOutputItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogIntegration[]>([]);
  const [inputSources, setInputSources] = useState<DataInputSummary[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const { error, success, setError, setSuccess } = useFormState();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingOutput, setEditingOutput] = useState<DataOutputItem | null>(null);

  const { permissions } = useSpacePermissions(space?.id);
  const { csrfFetch } = useCsrfFetch();
  const { user } = useCurrentUser();
  const isPlatformAdmin = checkIsAdmin(user?.role);
  const canView = isPlatformAdmin || permissions.canViewData;
  const canManage = isPlatformAdmin || permissions.canManageOutputs;

  // ── Data loading ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!space?.id) return;
    setDataLoading(true);
    try {
      const [outputsRes, catalogRes, inputsRes] = await Promise.all([
        fetch(`/api/spaces/${space.id}/data-outputs`),
        fetch(`/api/spaces/${space.id}/integrations/catalog`),
        fetch(`/api/spaces/${space.id}/data-inputs`),
      ]);

      if (outputsRes.ok) {
        setOutputs(await outputsRes.json());
      }
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        setCatalog(data.outputDestinations ?? []);
      }
      if (inputsRes.ok) {
        setInputSources(await inputsRes.json());
      }
    } catch {
      setError("Failed to load data outputs.");
    }
    setDataLoading(false);
  }, [space?.id, setError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Guards ────────────────────────────────────────────────────────────

  if (spaceLoading || dataLoading) return <SpacePageSkeleton />;
  if (!space) return <SpaceNotFound slug={slug} />;
  if (!canView) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space.name}
        backHref={`/spaces/${slug}`}
        message="You do not have access to data output settings for this space."
      />
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <SpacePageHeader
          slug={slug}
          spaceName={space.name}
          title="Data Output"
          description="Manage destinations that publish data from your stores."
          action={canManage ? (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Data Output
            </Button>
          ) : undefined}
        />

        <AlertMessages error={error} success={success} />

        {!canManage && (
          <Alert>
            <AlertDescription>
              Read-only mode: you can view data outputs, but only admins can add,
              edit, or remove them.
            </AlertDescription>
          </Alert>
        )}

        {/* Output cards */}
        {outputs.length === 0 ? (
          <EmptyStateCard
            icon={Upload}
            message={`No data outputs configured.${canManage ? " Add one to publish data from your stores externally." : ""}`}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {outputs.map((output) => {
              return (
                <Card
                  key={output.id}
                  className="cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() =>
                    router.push(`/spaces/${slug}/output/${output.id}`)
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base truncate pr-2">
                        {output.integration.displayName}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        {canManage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingOutput(output);
                            }}
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit settings"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 mt-0.5" />
                      </div>
                    </div>
                    <CardDescription className="text-xs text-slate-500">
                      Source: {output.stream?.name ?? "All Streams"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <StatusDot status={output.status} />
                          Status
                        </span>
                        <span className="capitalize text-slate-700">
                          {output.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Trigger</span>
                        <span className="text-slate-700">
                          {getTriggerLabel(output.trigger)}
                        </span>
                      </div>
                      {output.lastRunAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Last Run
                          </span>
                          <span className="text-slate-700 flex items-center gap-1">
                            {formatDistanceToNow(new Date(output.lastRunAt), {
                              addSuffix: true,
                            })}
                            {output.lastRunStatus && (
                              <Badge variant="outline" className="text-xs">
                                {output.lastRunStatus}
                              </Badge>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Data Output Dialog */}
        {space && (
          <AddDataOutputDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            spaceId={space.id}
            catalog={catalog}
            inputSources={inputSources}
            csrfFetch={csrfFetch}
            onCreated={() => {
              setShowAddDialog(false);
              setSuccess("Data output created successfully.");
              loadData();
            }}
            setError={setError}
          />
        )}

        {/* Edit Data Output Dialog */}
        {space && editingOutput && (
          <EditDataOutputDialog
            open={!!editingOutput}
            onOpenChange={(open) => { if (!open) setEditingOutput(null); }}
            spaceId={space.id}
            output={editingOutput}
            csrfFetch={csrfFetch}
            onSaved={() => {
              setEditingOutput(null);
              setSuccess("Data output updated successfully.");
              loadData();
            }}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Data Output Dialog (multi-step)
// ---------------------------------------------------------------------------

function AddDataOutputDialog({
  open,
  onOpenChange,
  spaceId,
  catalog,
  inputSources,
  csrfFetch,
  onCreated,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  catalog: CatalogIntegration[];
  inputSources: DataInputSummary[];
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onCreated: () => void;
  setError: (msg: string | null) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Select output type
  const [selectedKey, setSelectedKey] = useState("");

  // Step 2: Select source stream
  const [selectedStreamId, setSelectedStreamId] = useState("");

  // Step 3: Configuration
  const [trigger, setTrigger] = useState("");
  const [schedule, setSchedule] = useState("");
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>({});

  const selectedIntegration = catalog.find((c) => c.key === selectedKey);
  const isApiServeAll = selectedKey === "api-serve-all";
  const isWebhook = selectedKey === "webhook";
  const showTrigger =
    selectedIntegration &&
    selectedIntegration.supportedTriggers.length > 0;

  // Deduplicate streams from input sources
  const uniqueStreams = Array.from(
    new Map(inputSources.map((i) => [i.stream.id, i.stream])).values()
  );

  // Reset state on close
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedKey("");
    setSelectedStreamId("");
    setTrigger("");
    setSchedule("");
    setIntegrationConfig({});
  };

  const handleSelectIntegration = (key: string) => {
    setSelectedKey(key);
    const integration = catalog.find((c) => c.key === key);
    if (integration?.supportedTriggers.length) {
      setTrigger(integration.supportedTriggers[0].toLowerCase());
    } else {
      setTrigger("");
    }
    // api-serve-all doesn't need a specific stream — skip source selection
    if (key === "api-serve-all") {
      setSelectedStreamId("");
      setStep(3);
    } else {
      setStep(2);
    }
  };

  const handleSelectSource = () => {
    if (!selectedStreamId) return;
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!selectedKey || (!selectedStreamId && selectedKey !== "api-serve-all")) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        integrationKey: selectedKey,
        streamId: selectedStreamId || undefined,
        trigger: trigger || undefined,
        schedule: trigger === "cron" ? schedule : undefined,
        config: Object.keys(integrationConfig).length > 0 ? integrationConfig : undefined,
      };

      const res = await csrfFetch(`/api/spaces/${spaceId}/data-outputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create data output.");
        setSubmitting(false);
        return;
      }

      onCreated();
      resetForm();
    } catch {
      setError("Failed to create data output.");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? "Select Output Type"
              : step === 2
                ? "Select Source"
                : "Configure Output"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Choose how data will be published from this space."
              : step === 2
                ? "Select which data stream to publish from."
                : `Configure the "${selectedIntegration?.displayName}" output.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select output type */}
        {step === 1 && (
          <IntegrationCatalogList
            catalog={catalog}
            direction="output"
            csrfFetch={csrfFetch}
            spaceId={spaceId}
            onSelect={handleSelectIntegration}
            setError={setError}
          />
        )}

        {/* Step 2: Select source stream */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Data Stream</Label>
              <Select
                value={selectedStreamId}
                onValueChange={setSelectedStreamId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select stream..." />
                </SelectTrigger>
                <SelectContent>
                  {uniqueStreams.map((stream) => (
                    <SelectItem key={stream.id} value={stream.id}>
                      {stream.name} ({stream.artifactType})
                    </SelectItem>
                  ))}
                  {uniqueStreams.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No data inputs available. Create an input first.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Step 3: Configure */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Trigger */}
            {showTrigger && (
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedIntegration!.supportedTriggers.map((t) => {
                      const key = t.toLowerCase();
                      return (
                        <SelectItem key={key} value={key}>
                          {TRIGGER_LABELS[key] ?? key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {trigger === "cron" && (
              <CronScheduleInput
                value={schedule}
                onChange={setSchedule}
                label="Schedule"
              />
            )}

            {/* Integration-specific config fields */}
            {hasConfigFields(selectedKey) && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">
                  {selectedIntegration?.displayName} Configuration
                </p>
                <IntegrationConfigFieldsWithDirection
                  integrationKey={selectedKey}
                  direction="output"
                  config={integrationConfig}
                  onChange={setIntegrationConfig}
                />
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-4 mt-2">
          <DialogFooter>
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() =>
                  setStep((s) =>
                    // api-serve-all skips step 2, so go back to step 1 from step 3
                    s === 3 && isApiServeAll ? 1 : ((s - 1) as 1 | 2 | 3)
                  )
                }
                className="mr-auto"
              >
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {step === 2 && (
              <Button onClick={handleSelectSource} disabled={!selectedStreamId}>
                Next
              </Button>
            )}
            {step === 3 && (
              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (isWebhook && !integrationConfig.url)
                }
              >
                {submitting ? "Creating..." : "Create"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Data Output Dialog
// ---------------------------------------------------------------------------

function EditDataOutputDialog({
  open,
  onOpenChange,
  spaceId,
  output,
  csrfFetch,
  onSaved,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  output: DataOutputItem;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const [trigger, setTrigger] = useState(output.trigger ?? "");
  const [schedule, setSchedule] = useState(output.schedule ?? "");
  const [status, setStatus] = useState(output.status);
  const [configData, setConfigData] = useState<IntegrationConfig>(
    (output.config as IntegrationConfig) || {}
  );
  const [saving, setSaving] = useState(false);

  const supportedTriggers = output.integration.supportedTriggers;
  const showTrigger = supportedTriggers.length > 0;
  const showConfig = hasConfigFields(output.integration.key);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {};
      if (trigger !== (output.trigger ?? "")) body.trigger = trigger || undefined;
      if (trigger === "cron" && schedule !== (output.schedule ?? "")) body.schedule = schedule;
      if (status !== output.status) body.status = status;

      // Include config if it changed
      const origConfig = JSON.stringify(output.config || {});
      const newConfig = JSON.stringify(configData);
      if (newConfig !== origConfig) {
        body.config = configData;
      }

      if (Object.keys(body).length === 0) {
        onSaved();
        return;
      }

      const res = await csrfFetch(
        `/api/spaces/${spaceId}/data-outputs/${output.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update data output.");
        setSaving(false);
        return;
      }

      onSaved();
    } catch {
      setError("Failed to update data output.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {output.integration.displayName}</DialogTitle>
          <DialogDescription>
            Update configuration for this data output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {showTrigger && (
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedTriggers.map((t) => {
                    const key = t.toLowerCase();
                    return (
                      <SelectItem key={key} value={key}>
                        {TRIGGER_LABELS[key] ?? key}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {trigger === "cron" && (
            <CronScheduleInput
              value={schedule}
              onChange={setSchedule}
              label="Schedule"
            />
          )}

          {/* Integration-specific config */}
          {showConfig && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-3">
                {output.integration.displayName} Configuration
              </p>
              <IntegrationConfigFieldsWithDirection
                integrationKey={output.integration.key}
                direction="output"
                config={configData}
                onChange={setConfigData}
              />
            </div>
          )}
        </div>

        <div className="border-t pt-4 mt-2">
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

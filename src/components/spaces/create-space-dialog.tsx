"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Space } from "@/lib/entities";
import type { Space as SpaceType } from "@/lib/entities/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Trash2, Plug } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AssetTypeSelect } from "@/components/common/asset-type-select";
import {
  BLOCKCHAIN_METADATA,
  BLOCKCHAIN_TESTNET_METADATA,
  type SupportedBlockchain,
} from "@/lib/blockchain";
import { defaultIntegrations } from "@/lib/integrations/default-integrations";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sanitizeSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "");

const slugFromName = (value: string) => sanitizeSlug(value) || "space";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSpaceCreated: () => void;
}

type FormState = {
  name: string;
  description: string;
  slug: string;
};

const ARTIFACT_TYPE_OPTIONS = [
  { value: "value", label: "Simple Value", description: "Simple numeric value (e.g., 1000 grams)" },
  { value: "merkle_tree", label: "Merkle Tree", description: "Hash-based cryptographic proofs" },
  { value: "merkle_sum_tree", label: "Merkle Sum Tree", description: "Proofs with balance sums (exchange PoR)" },
  { value: "sparse_merkle_tree", label: "Sparse Merkle Tree", description: "Fixed-size membership proofs" },
] as const;

/** Derive input source options from the shared integration catalog */
const INPUT_SOURCE_OPTIONS = defaultIntegrations
  .filter((i) => i.supportsInput)
  .map((i) => ({
    key: i.key,
    label: i.displayName,
    description: i.description,
    supportedArtifactTypes: i.supportedArtifactTypes.map((t) => t.toLowerCase()),
    isFree: i.isFree,
  }));

/** Represents one input source + its target data stream, before creation */
export interface InputConfig {
  id: string; // client-side key for React
  sourceType: string;
  streamName: string;
  streamSlug: string;
  assetType: string;
  unit: string;
  artifactType: string;
  sourceConfig: Record<string, unknown>;
}

/** Derive output destination options from the shared integration catalog */
const OUTPUT_DEST_OPTIONS = defaultIntegrations
  .filter((i) => i.supportsOutput)
  .map((i) => ({
    key: i.key,
    label: i.displayName,
    description: i.description,
    supportedArtifactTypes: i.supportedArtifactTypes.map((t) => t.toLowerCase()),
    isFree: i.isFree,
  }));

const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual", description: "Trigger manually from the dashboard" },
  { value: "on_change", label: "On New Entry", description: "Trigger when a new entry is submitted" },
  { value: "cron", label: "Scheduled", description: "Run on a cron schedule" },
] as const;

/** Represents one output destination linked to a data stream, before creation */
export interface OutputConfig {
  id: string;
  destType: string;
  streamRef: string; // streamSlug from inputConfigs
  trigger: string;
  schedule: string;
  destConfig: Record<string, unknown>;
}

let outputIdCounter = 0;
function makeOutputConfig(destType: string = "api-serve"): OutputConfig {
  outputIdCounter += 1;
  return {
    id: `output-${outputIdCounter}`,
    destType,
    streamRef: "",
    trigger: destType === "webhook" || destType === "rwa-xyz" ? "on_change" : "manual",
    schedule: "",
    destConfig: defaultDestConfig(destType),
  };
}

function defaultDestConfig(destType: string): Record<string, unknown> {
  switch (destType) {
    case "api-serve":
    case "api-serve-all":
      return { isPublic: true };
    case "webhook":
      return { url: "", secret: "", retries: 3 };
    case "avalanche":
      return {
        blockchain: "avalanche",
        rpcUrl: BLOCKCHAIN_METADATA.avalanche.rpcUrl,
        chainId: BLOCKCHAIN_METADATA.avalanche.chainId,
        contractAddress: "",
        signerKey: "",
        valueDecimals: 18,
      };
    case "rwa-xyz":
      return { apiKey: "", projectId: "", endpoint: "" };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Default source configs per integration key
// ---------------------------------------------------------------------------

function defaultSourceConfig(sourceType: string): Record<string, unknown> {
  switch (sourceType) {
    case "api":
      return { endpoint: "", headers: {} };
    case "blockchain-read":
      return {
        blockchain: "avalanche",
        rpcUrl: BLOCKCHAIN_METADATA.avalanche.rpcUrl,
        chainId: BLOCKCHAIN_METADATA.avalanche.chainId,
        contractAddress: "",
      };
    case "api-fetch":
      return { endpoint: "", method: "GET", headers: {} };
    default:
      return {};
  }
}

let inputIdCounter = 0;
function makeInputConfig(sourceType: string = "manual"): InputConfig {
  inputIdCounter += 1;
  return {
    id: `input-${inputIdCounter}`,
    sourceType,
    streamName: "",
    streamSlug: "",
    assetType: "",
    unit: "",
    artifactType: "value",
    sourceConfig: defaultSourceConfig(sourceType),
  };
}

function suggestStreamName(assetType: string, unit: string): string {
  const parts = [assetType, unit].filter(Boolean);
  if (parts.length === 0) return "";
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// ---------------------------------------------------------------------------
// Source Config Form (inline per input)
// ---------------------------------------------------------------------------

function SourceConfigFields({
  input,
  onChange,
}: {
  input: InputConfig;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const c = input.sourceConfig;
  const set = (key: string, value: unknown) => onChange({ ...c, [key]: value });

  if (input.sourceType === "api") {
    return (
      <div className="space-y-2">
        <Label>API Endpoint</Label>
        <Input
          placeholder="https://example.com/reserves"
          value={String(c.endpoint ?? "")}
          onChange={(e) => set("endpoint", e.target.value)}
        />
      </div>
    );
  }

  if (input.sourceType === "api-fetch") {
    return (
      <>
        <div className="space-y-2">
          <Label>API Endpoint *</Label>
          <Input
            placeholder="https://example.com/reserves"
            value={String(c.endpoint ?? "")}
            onChange={(e) => set("endpoint", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Method</Label>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={String(c.method ?? "GET")}
            onChange={(e) => set("method", e.target.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
      </>
    );
  }

  if (input.sourceType === "blockchain-read") {
    return <BlockchainReadSourceFields config={c} onChange={onChange} />;
  }

  // manual, csv-upload, and any future config-less sources
  return null;
}

function BlockchainReadSourceFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const blockchain = String(config.blockchain || "avalanche");
  const isTestnet = !!config.isTestnet;

  const handleChainChange = (chain: string) => {
    const meta = BLOCKCHAIN_METADATA[chain as SupportedBlockchain];
    if (meta) {
      onChange({
        ...config,
        blockchain: chain,
        rpcUrl: meta.rpcUrl,
        chainId: meta.chainId,
        isTestnet: false,
      });
    }
  };

  const handleTestnetToggle = (testnet: boolean) => {
    if (testnet && blockchain in BLOCKCHAIN_TESTNET_METADATA) {
      const meta = BLOCKCHAIN_TESTNET_METADATA[blockchain as keyof typeof BLOCKCHAIN_TESTNET_METADATA];
      onChange({ ...config, isTestnet: true, rpcUrl: meta.rpcUrl, chainId: meta.chainId });
    } else {
      const meta = BLOCKCHAIN_METADATA[blockchain as SupportedBlockchain];
      if (meta) {
        onChange({ ...config, isTestnet: false, rpcUrl: meta.rpcUrl, chainId: meta.chainId });
      }
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Blockchain *</Label>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={blockchain}
          onChange={(e) => handleChainChange(e.target.value)}
        >
          <option value="avalanche">Avalanche C-Chain</option>
          <option value="ethereum">Ethereum</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Contract Address *</Label>
        <Input
          placeholder="0x..."
          value={String(config.contractAddress ?? "")}
          onChange={(e) => onChange({ ...config, contractAddress: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        Advanced Options
      </button>
      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {blockchain in BLOCKCHAIN_TESTNET_METADATA && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bc-read-testnet"
                checked={isTestnet}
                onChange={(e) => handleTestnetToggle(e.target.checked)}
                className="rounded border-slate-300"
              />
              <Label htmlFor="bc-read-testnet" className="text-sm">
                Use Testnet
              </Label>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm">RPC URL</Label>
            <Input
              placeholder="Auto-configured"
              value={String(config.rpcUrl ?? "")}
              onChange={(e) => onChange({ ...config, rpcUrl: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">Custom JSON-RPC endpoint (auto-configured by default)</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Chain ID</Label>
            <Input
              type="number"
              value={config.chainId !== undefined ? String(config.chainId) : ""}
              onChange={(e) => onChange({ ...config, chainId: parseInt(e.target.value) || 0 })}
              placeholder="Auto-configured"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Destination Config Form (inline per output)
// ---------------------------------------------------------------------------

function DestConfigFields({
  output,
  onChange,
}: {
  output: OutputConfig;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const c = output.destConfig;
  const set = (key: string, value: unknown) => onChange({ ...c, [key]: value });

  if (output.destType === "api-serve") {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isPublic"
          checked={Boolean(c.isPublic ?? true)}
          onChange={(e) => set("isPublic", e.target.checked)}
          className="rounded border-slate-300"
        />
        <Label htmlFor="isPublic">Public access (no API key required)</Label>
      </div>
    );
  }

  if (output.destType === "webhook") {
    return (
      <>
        <div className="space-y-2">
          <Label>Webhook URL *</Label>
          <Input
            placeholder="https://example.com/webhook"
            value={String(c.url ?? "")}
            onChange={(e) => set("url", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Signing Secret</Label>
          <Input
            placeholder="Auto-generated if empty"
            value={String(c.secret ?? "")}
            onChange={(e) => set("secret", e.target.value)}
          />
        </div>
      </>
    );
  }

  if (output.destType === "rwa-xyz") {
    return (
      <>
        <div className="space-y-2">
          <Label>RWA.xyz API Key *</Label>
          <Input
            placeholder="Your RWA.xyz API key"
            value={String(c.apiKey ?? "")}
            onChange={(e) => set("apiKey", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Project ID *</Label>
          <Input
            placeholder="RWA.xyz project identifier"
            value={String(c.projectId ?? "")}
            onChange={(e) => set("projectId", e.target.value)}
          />
        </div>
      </>
    );
  }

  // Avalanche/blockchain output
  return <BlockchainOutputDestFields config={c} onChange={onChange} />;
}

function BlockchainOutputDestFields({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const blockchain = String(config.blockchain || "avalanche");
  const isTestnet = !!config.isTestnet;

  const handleChainChange = (chain: string) => {
    const meta = BLOCKCHAIN_METADATA[chain as SupportedBlockchain];
    if (meta) {
      onChange({
        ...config,
        blockchain: chain,
        rpcUrl: meta.rpcUrl,
        chainId: meta.chainId,
        isTestnet: false,
      });
    }
  };

  const handleTestnetToggle = (testnet: boolean) => {
    if (testnet && blockchain in BLOCKCHAIN_TESTNET_METADATA) {
      const meta = BLOCKCHAIN_TESTNET_METADATA[blockchain as keyof typeof BLOCKCHAIN_TESTNET_METADATA];
      onChange({ ...config, isTestnet: true, rpcUrl: meta.rpcUrl, chainId: meta.chainId });
    } else {
      const meta = BLOCKCHAIN_METADATA[blockchain as SupportedBlockchain];
      if (meta) {
        onChange({ ...config, isTestnet: false, rpcUrl: meta.rpcUrl, chainId: meta.chainId });
      }
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label>Blockchain *</Label>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={blockchain}
          onChange={(e) => handleChainChange(e.target.value)}
        >
          <option value="avalanche">Avalanche C-Chain</option>
          <option value="ethereum">Ethereum</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label>Contract Address *</Label>
        <Input
          placeholder="0x..."
          value={String(config.contractAddress ?? "")}
          onChange={(e) => onChange({ ...config, contractAddress: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Signer Key *</Label>
        <Input
          type="password"
          placeholder="Private key for signing transactions"
          value={String(config.signerKey ?? "")}
          onChange={(e) => onChange({ ...config, signerKey: e.target.value })}
        />
      </div>
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        Advanced Options
      </button>
      {showAdvanced && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {blockchain in BLOCKCHAIN_TESTNET_METADATA && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="bc-out-testnet"
                checked={isTestnet}
                onChange={(e) => handleTestnetToggle(e.target.checked)}
                className="rounded border-slate-300"
              />
              <Label htmlFor="bc-out-testnet" className="text-sm">
                Use Testnet
              </Label>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-sm">RPC URL</Label>
            <Input
              placeholder="Auto-configured"
              value={String(config.rpcUrl ?? "")}
              onChange={(e) => onChange({ ...config, rpcUrl: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-500">Custom JSON-RPC endpoint (auto-configured by default)</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Chain ID</Label>
            <Input
              type="number"
              value={config.chainId !== undefined ? String(config.chainId) : ""}
              onChange={(e) => onChange({ ...config, chainId: parseInt(e.target.value) || 0 })}
              placeholder="Auto-configured"
            />
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

export default function CreateSpaceDialog({ open, onOpenChange, onSpaceCreated }: CreateSpaceDialogProps) {
  const [formData, setFormData] = useState<FormState>({
    name: "",
    description: "",
    slug: "",
  });
  const [inputConfigs, setInputConfigs] = useState<InputConfig[]>([]);
  const [expandedInputId, setExpandedInputId] = useState<string | null>(null);
  const [outputConfigs, setOutputConfigs] = useState<OutputConfig[]>([]);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSlugDirty, setIsSlugDirty] = useState(false);
  const [isSlugChecking, setIsSlugChecking] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [isStepTransitioning, setIsStepTransitioning] = useState(false);
  const { user: currentUser } = useCurrentUser();

  const steps = useMemo(
    () => [
      { title: "Details", description: "Space name, slug, and description." },
      { title: "Data Inputs", description: "Configure data stores and input sources." },
      { title: "Data Outputs", description: "Select where verified data is published." },
      { title: "Review", description: "Confirm your space configuration." },
    ],
    []
  );

  const resetState = useCallback(() => {
    setFormData({ name: "", description: "", slug: "" });
    setInputConfigs([]);
    setExpandedInputId(null);
    setOutputConfigs([]);
    setExpandedOutputId(null);
    setCurrentStep(0);
    setIsStepTransitioning(false);
    setIsSlugDirty(false);
    setSlugTouched(false);
    setSlugError(null);
    setError(null);
    inputIdCounter = 0;
    outputIdCounter = 0;
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // Slug validation
  useEffect(() => {
    if (!formData.slug.trim()) {
      setIsSlugChecking(false);
      if (slugTouched) {
        setSlugError("Slug is required");
      } else {
        setSlugError(null);
      }
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSlugChecking(true);
      setSlugError(null);
      try {
        const results = await Space.filter({ slug: formData.slug.trim() });
        if (cancelled) return;
        if (results.length > 0) {
          setSlugError("Slug is already in use. Please choose another.");
        } else {
          setSlugError(null);
        }
      } catch (checkError) {
        if (cancelled) return;
        console.error("Error validating slug:", checkError);
        setSlugError("Failed to validate slug. Try again.");
      } finally {
        if (!cancelled) {
          setIsSlugChecking(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.slug, slugTouched]);

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  const handleInputChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameChange = (value: string) => {
    setFormData((prev) => {
      const next = { ...prev, name: value };
      if (!isSlugDirty) {
        next.slug = slugFromName(value);
      }
      return next;
    });
  };

  const handleSlugChange = (value: string) => {
    setIsSlugDirty(true);
    setSlugTouched(true);
    setFormData((prev) => ({ ...prev, slug: sanitizeSlug(value) }));
  };

  // ---------------------------------------------------------------------------
  // Input config handlers
  // ---------------------------------------------------------------------------

  const addInput = () => {
    const newInput = makeInputConfig("manual");
    setInputConfigs((prev) => [...prev, newInput]);
    setExpandedInputId(newInput.id);
  };

  const removeInput = (id: string) => {
    setInputConfigs((prev) => prev.filter((i) => i.id !== id));
    if (expandedInputId === id) setExpandedInputId(null);
  };

  const updateInput = (id: string, updates: Partial<InputConfig>) => {
    setInputConfigs((prev) =>
      prev.map((input) => {
        if (input.id !== id) return input;
        const updated = { ...input, ...updates };

        // Auto-suggest stream name when asset type or unit changes
        if (("assetType" in updates || "unit" in updates) && !updated.streamName) {
          updated.streamName = suggestStreamName(updated.assetType, updated.unit);
          updated.streamSlug = sanitizeSlug(updated.streamName);
        }

        return updated;
      })
    );
  };

  const changeSourceType = (id: string, newType: string) => {
    setInputConfigs((prev) =>
      prev.map((input) => {
        if (input.id !== id) return input;
        const sourceMeta = INPUT_SOURCE_OPTIONS.find((o) => o.key === newType);
        // If current artifact type isn't supported by the new source, reset to first supported
        const artifactType = sourceMeta?.supportedArtifactTypes.includes(input.artifactType)
          ? input.artifactType
          : sourceMeta?.supportedArtifactTypes[0] ?? "value";
        return {
          ...input,
          sourceType: newType,
          artifactType,
          sourceConfig: defaultSourceConfig(newType),
        };
      })
    );
  };

  // ---------------------------------------------------------------------------
  // Output config handlers
  // ---------------------------------------------------------------------------

  const addOutput = () => {
    const newOutput = makeOutputConfig("api-serve");
    // Auto-assign streamRef if there's exactly one compatible input
    const destMeta = OUTPUT_DEST_OPTIONS.find((o) => o.key === newOutput.destType);
    const compatibleInputs = inputConfigs.filter((i) =>
      destMeta?.supportedArtifactTypes.includes(i.artifactType)
    );
    if (compatibleInputs.length === 1) {
      newOutput.streamRef = compatibleInputs[0].streamSlug;
    }
    setOutputConfigs((prev) => [...prev, newOutput]);
    setExpandedOutputId(newOutput.id);
  };

  const removeOutput = (id: string) => {
    setOutputConfigs((prev) => prev.filter((o) => o.id !== id));
    if (expandedOutputId === id) setExpandedOutputId(null);
  };

  const updateOutput = (id: string, updates: Partial<OutputConfig>) => {
    setOutputConfigs((prev) =>
      prev.map((output) => (output.id !== id ? output : { ...output, ...updates }))
    );
  };

  const changeDestType = (id: string, newType: string) => {
    setOutputConfigs((prev) =>
      prev.map((output) => {
        if (output.id !== id) return output;
        const destMeta = OUTPUT_DEST_OPTIONS.find((o) => o.key === newType);
        const defaultTrigger = newType === "webhook" || newType === "rwa-xyz" ? "on_change" : "manual";
        // Check if current streamRef is still compatible with new dest type
        const compatibleInputs = inputConfigs.filter((i) =>
          destMeta?.supportedArtifactTypes.includes(i.artifactType)
        );
        const currentRefStillValid = compatibleInputs.some((i) => i.streamSlug === output.streamRef);
        let streamRef = currentRefStillValid ? output.streamRef : "";
        // Auto-assign if exactly one compatible input
        if (!streamRef && compatibleInputs.length === 1) {
          streamRef = compatibleInputs[0].streamSlug;
        }
        return {
          ...output,
          destType: newType,
          trigger: defaultTrigger,
          destConfig: defaultDestConfig(newType),
          streamRef,
        };
      })
    );
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateStep = (step: number): boolean => {
    const normalizedSlug = sanitizeSlug(formData.slug);
    setError(null);

    if (step === 0) {
      setSlugTouched(true);
      if (!formData.name.trim() || !normalizedSlug) {
        setError("Please fill in the space name and slug.");
        if (!normalizedSlug) setSlugError("Slug is required");
        return false;
      }
      if (slugError) {
        setError(slugError);
        return false;
      }
      if (isSlugChecking) {
        setError("Please wait for slug validation to complete.");
        return false;
      }
    }

    if (step === 1) {
      // Step 2 is optional — no inputs required. But if inputs exist, validate them.
      for (const input of inputConfigs) {
        if (!input.streamName.trim()) {
          setError(`Input "${INPUT_SOURCE_OPTIONS.find((o) => o.key === input.sourceType)?.label}": stream name is required.`);
          setExpandedInputId(input.id);
          return false;
        }
        if (!input.assetType.trim()) {
          setError(`Input "${input.streamName}": asset type is required.`);
          setExpandedInputId(input.id);
          return false;
        }

        // Source-specific validation
        if (input.sourceType === "api-fetch") {
          const endpoint = String(input.sourceConfig.endpoint ?? "").trim();
          if (!endpoint) {
            setError(`Input "${input.streamName}": endpoint URL is required.`);
            setExpandedInputId(input.id);
            return false;
          }
        }

        if (input.sourceType === "blockchain-read") {
          const rpcUrl = String(input.sourceConfig.rpcUrl ?? "").trim();
          const contractAddress = String(input.sourceConfig.contractAddress ?? "").trim();
          if (!rpcUrl || !contractAddress) {
            setError(`Input "${input.streamName}": RPC URL and contract address are required.`);
            setExpandedInputId(input.id);
            return false;
          }
        }
      }

      // Check for duplicate stream slugs
      const slugs = inputConfigs.map((i) => sanitizeSlug(i.streamSlug || i.streamName));
      const uniqueSlugs = new Set(slugs);
      if (slugs.length > 0 && uniqueSlugs.size !== slugs.length) {
        setError("Each data store must have a unique name.");
        return false;
      }
    }

    if (step === 2) {
      // Step 3 is optional — no outputs required. But if outputs exist, validate them.
      for (const output of outputConfigs) {
        // Require a data store selection when inputs exist
        if (inputConfigs.length > 0 && !output.streamRef) {
          const label = OUTPUT_DEST_OPTIONS.find((o) => o.key === output.destType)?.label ?? output.destType;
          setError(`Output "${label}": please select a data store.`);
          setExpandedOutputId(output.id);
          return false;
        }
        if (output.destType === "webhook") {
          const url = String(output.destConfig.url ?? "").trim();
          if (!url) {
            setError(`Output "Webhook": webhook URL is required.`);
            setExpandedOutputId(output.id);
            return false;
          }
        }
        if (output.destType === "avalanche") {
          const rpcUrl = String(output.destConfig.rpcUrl ?? "").trim();
          const contractAddress = String(output.destConfig.contractAddress ?? "").trim();
          const signerKey = String(output.destConfig.signerKey ?? "").trim();
          if (!rpcUrl || !contractAddress || !signerKey) {
            setError(`Output "Avalanche": RPC URL, contract address, and signer key are required.`);
            setExpandedOutputId(output.id);
            return false;
          }
        }
        if (output.destType === "rwa-xyz") {
          const apiKey = String(output.destConfig.apiKey ?? "").trim();
          const projectId = String(output.destConfig.projectId ?? "").trim();
          if (!apiKey || !projectId) {
            setError(`Output "RWA.xyz": API key and project ID are required.`);
            setExpandedOutputId(output.id);
            return false;
          }
        }
        if (output.trigger === "cron" && !output.schedule.trim()) {
          const label = OUTPUT_DEST_OPTIONS.find((o) => o.key === output.destType)?.label ?? output.destType;
          setError(`Output "${label}": cron schedule is required when trigger is "Scheduled".`);
          setExpandedOutputId(output.id);
          return false;
        }
      }
    }

    return true;
  };

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const goNext = () => {
    if (isStepTransitioning) return;
    if (!validateStep(currentStep)) return;
    const enteringLastStep = currentStep === steps.length - 2;
    if (enteringLastStep) {
      setIsStepTransitioning(true);
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    if (enteringLastStep) {
      window.setTimeout(() => setIsStepTransitioning(false), 200);
    }
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  const createSpace = async () => {
    const normalizedSlug = sanitizeSlug(formData.slug);
    setIsLoading(true);
    setError(null);

    if (!currentUser?.id) {
      setError("You must be signed in to create a space.");
      setIsLoading(false);
      return;
    }

    try {
      const payload: Omit<SpaceType, "id" | "created_date"> & {
        streams?: Array<{
          sourceType: string;
          streamName: string;
          streamSlug: string;
          assetType: string;
          unit: string;
          artifactType: string;
          sourceConfig: Record<string, unknown>;
        }>;
        outputs?: Array<{
          destType: string;
          streamRef: string;
          trigger: string;
          schedule: string;
          destConfig: Record<string, unknown>;
        }>;
      } = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        slug: normalizedSlug,
        created_by: currentUser.id,
        is_active: true,
        api_identifier: normalizedSlug,
        api_identifier_source: "slug",
        verification_public: true,
      };

      // Include stream and output configs for atomic backend creation
      if (inputConfigs.length > 0) {
        payload.streams = inputConfigs.map((input) => ({
          sourceType: input.sourceType,
          streamName: input.streamName,
          streamSlug: sanitizeSlug(input.streamSlug || input.streamName),
          assetType: input.assetType,
          unit: input.unit,
          artifactType: input.artifactType,
          sourceConfig: input.sourceConfig,
        }));
      }

      if (outputConfigs.length > 0) {
        payload.outputs = outputConfigs.map((output) => ({
          destType: output.destType,
          streamRef: output.streamRef,
          trigger: output.trigger,
          schedule: output.schedule,
          destConfig: output.destConfig,
        }));
      }

      await Space.create(payload as Omit<SpaceType, "id" | "created_date">);

      resetState();
      onOpenChange(false);
      onSpaceCreated();
    } catch (submitError) {
      console.error("Error creating space:", submitError);
      setError("Failed to create space. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStepTransitioning) return;
    if (!validateStep(currentStep)) return;
    if (currentStep < steps.length - 1) {
      goNext();
      return;
    }
    await createSpace();
  };

  const handleCreateNow = async () => {
    if (isStepTransitioning || isLoading) return;
    if (!validateStep(0)) return;
    await createSpace();
  };

  const isLastStep = currentStep === steps.length - 1;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Space</DialogTitle>
        </DialogHeader>

        <div className="mb-1">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Step {currentStep + 1} of {steps.length}</span>
            <span>{steps[currentStep]?.title}</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((step, index) => (
              <div
                key={step.title}
                className={`h-1.5 rounded-full ${index <= currentStep ? "bg-slate-900" : "bg-slate-200"}`}
              />
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">{steps[currentStep]?.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ---- Step 1: Space Details ---- */}
          {currentStep === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Space Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. ACC Gold, Emeralds Switzerland"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  placeholder="auto-generated-from-name"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onBlur={() => setSlugTouched(true)}
                />
                <p className="text-xs text-slate-500">Used in URLs, lowercase letters, numbers, and dashes only.</p>
                {slugError && slugTouched && <p className="text-xs text-red-500">{slugError}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what this space tracks..."
                  value={formData.description}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  className="h-20"
                />
              </div>
            </>
          )}

          {/* ---- Step 2: Data Inputs ---- */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex items-start gap-2">
                <Plug className="w-4 h-4 mt-0.5 text-slate-700" />
                <span>
                  Add data stores with input sources. Each store tracks a specific asset and data type.
                  You can skip this step and configure stores later.
                </span>
              </div>

              {inputConfigs.map((input) => {
                const isExpanded = expandedInputId === input.id;
                const sourceMeta = INPUT_SOURCE_OPTIONS.find((o) => o.key === input.sourceType);
                const availableArtifactTypes = ARTIFACT_TYPE_OPTIONS.filter((a) =>
                  sourceMeta?.supportedArtifactTypes.includes(a.value)
                );

                return (
                  <div
                    key={input.id}
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    {/* Card header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedInputId(isExpanded ? null : input.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">
                            {input.streamName || "Untitled Store"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {sourceMeta?.label}
                            {input.assetType && ` · ${input.assetType}`}
                            {input.unit && ` (${input.unit})`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeInput(input.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Card body */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/50">
                        {/* Source type */}
                        <div className="space-y-2">
                          <Label>Source Type *</Label>
                          <select
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={input.sourceType}
                            onChange={(e) => changeSourceType(input.id, e.target.value)}
                          >
                            {INPUT_SOURCE_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500">{sourceMeta?.description}</p>
                        </div>

                        {/* Stream config: asset type, unit, artifact type, stream name */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Asset Type *</Label>
                            <AssetTypeSelect
                              value={input.assetType}
                              onValueChange={(assetType) => {
                                const streamName = suggestStreamName(assetType, input.unit);
                                updateInput(input.id, {
                                  assetType,
                                  streamName: streamName || input.streamName,
                                  streamSlug: streamName ? sanitizeSlug(streamName) : input.streamSlug,
                                });
                              }}
                              placeholder="Select asset type..."
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Unit</Label>
                            <Input
                              placeholder="e.g. grams, pieces, tokens"
                              value={input.unit}
                              onChange={(e) => {
                                const unit = e.target.value;
                                const streamName = suggestStreamName(input.assetType, unit);
                                updateInput(input.id, {
                                  unit,
                                  streamName: streamName || input.streamName,
                                  streamSlug: streamName ? sanitizeSlug(streamName) : input.streamSlug,
                                });
                              }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Artifact Type *</Label>
                            <select
                              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                              value={input.artifactType}
                              onChange={(e) => updateInput(input.id, { artifactType: e.target.value })}
                            >
                              {availableArtifactTypes.map((a) => (
                                <option key={a.value} value={a.value}>{a.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>Store Name *</Label>
                            <Input
                              placeholder="e.g. Gold Reserves"
                              value={input.streamName}
                              onChange={(e) => updateInput(input.id, {
                                streamName: e.target.value,
                                streamSlug: sanitizeSlug(e.target.value),
                              })}
                            />
                          </div>
                        </div>

                        {/* Source-specific config */}
                        <div className="pt-2 border-t border-slate-200">
                          <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                            Source Configuration
                          </p>
                          <div className="space-y-3">
                            <SourceConfigFields
                              input={input}
                              onChange={(config) => updateInput(input.id, { sourceConfig: config })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add input button */}
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={addInput}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Data Input
              </Button>

              {inputConfigs.length === 0 && (
                <p className="text-xs text-slate-500 text-center">
                  No inputs configured. You can add them later from space settings.
                </p>
              )}
            </div>
          )}

          {/* ---- Step 3: Data Outputs ---- */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 flex items-start gap-2">
                <Plug className="w-4 h-4 mt-0.5 text-slate-700" />
                <span>
                  Add output destinations to publish verified data externally.
                  You can skip this step and configure outputs later.
                </span>
              </div>

              {outputConfigs.map((output) => {
                const isExpanded = expandedOutputId === output.id;
                const destMeta = OUTPUT_DEST_OPTIONS.find((o) => o.key === output.destType);
                const streamLabel = output.streamRef
                  ? inputConfigs.find((i) => i.streamSlug === output.streamRef)?.streamName ?? output.streamRef
                  : "No store selected";

                return (
                  <div
                    key={output.id}
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    {/* Card header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-white cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedOutputId(isExpanded ? null : output.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-slate-900 truncate">
                            {destMeta?.label ?? output.destType}
                          </p>
                          <p className="text-xs text-slate-500">
                            {streamLabel}
                            {output.destType !== "api-serve" && (
                              <>
                                {" · "}
                                {TRIGGER_OPTIONS.find((t) => t.value === output.trigger)?.label ?? output.trigger}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeOutput(output.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Card body */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 bg-slate-50/50">
                        {/* Destination type */}
                        <div className="space-y-2">
                          <Label>Destination Type *</Label>
                          <select
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={output.destType}
                            onChange={(e) => changeDestType(output.id, e.target.value)}
                          >
                            {OUTPUT_DEST_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>{opt.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500">{destMeta?.description}</p>
                        </div>

                        {/* Stream selection */}
                        {inputConfigs.length > 0 && (() => {
                          const compatibleInputs = inputConfigs.filter((i) =>
                            destMeta?.supportedArtifactTypes.includes(i.artifactType)
                          );
                          return compatibleInputs.length > 0 ? (
                            <div className="space-y-2">
                              <Label>Data Store *</Label>
                              <select
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={output.streamRef}
                                onChange={(e) => updateOutput(output.id, { streamRef: e.target.value })}
                              >
                                {compatibleInputs.length > 1 && !output.streamRef && (
                                  <option value="">Select a data store</option>
                                )}
                                {compatibleInputs.map((i) => (
                                  <option key={i.streamSlug} value={i.streamSlug}>
                                    {i.streamName || i.streamSlug}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null;
                        })()}

                        {/* Trigger (not applicable for API — always serves latest) */}
                        {output.destType !== "api-serve" && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Trigger *</Label>
                              <select
                                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                                value={output.trigger}
                                onChange={(e) => updateOutput(output.id, { trigger: e.target.value })}
                              >
                                {TRIGGER_OPTIONS.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                            </div>
                            {output.trigger === "cron" && (
                              <div className="space-y-2">
                                <Label>Cron Schedule *</Label>
                                <Input
                                  placeholder="0 */6 * * *"
                                  value={output.schedule}
                                  onChange={(e) => updateOutput(output.id, { schedule: e.target.value })}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Destination-specific config */}
                        <div className="pt-2 border-t border-slate-200">
                          <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">
                            Destination Configuration
                          </p>
                          <div className="space-y-3">
                            <DestConfigFields
                              output={output}
                              onChange={(config) => updateOutput(output.id, { destConfig: config })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add output button */}
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={addOutput}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Data Output
              </Button>

              {outputConfigs.length === 0 && (
                <p className="text-xs text-slate-500 text-center">
                  No outputs configured. You can add them later from space settings.
                </p>
              )}
            </div>
          )}

          {/* ---- Step 4: Review ---- */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Space Details */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-medium text-slate-900 mb-3">Space Details</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Name:</span>
                    <span className="font-medium">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Slug:</span>
                    <span className="font-medium font-mono">{formData.slug}</span>
                  </div>
                  {formData.description && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Description:</span>
                      <span className="font-medium text-right max-w-xs truncate">{formData.description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Data Streams (derived from inputs) */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-medium text-slate-900 mb-3">
                  Data Stores ({inputConfigs.length})
                </h3>
                {inputConfigs.length > 0 ? (
                  <div className="space-y-3 text-sm">
                    {inputConfigs.map((input) => {
                      const linkedOutputs = outputConfigs.filter(
                        (o) => o.streamRef === input.streamSlug
                      );
                      return (
                        <div key={input.id} className="rounded border border-slate-200 bg-white p-3">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-medium text-slate-900">{input.streamName}</span>
                            <span className="text-xs text-slate-400">
                              {input.assetType}{input.unit ? ` (${input.unit})` : ""}
                              {" · "}
                              {ARTIFACT_TYPE_OPTIONS.find((a) => a.value === input.artifactType)?.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span>
                              Input: {INPUT_SOURCE_OPTIONS.find((o) => o.key === input.sourceType)?.label}
                            </span>
                            {linkedOutputs.length > 0 && (
                              <span>
                                Outputs: {linkedOutputs.map((o) =>
                                  OUTPUT_DEST_OPTIONS.find((d) => d.key === o.destType)?.label
                                ).join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No data stores configured</p>
                )}
              </div>

              {/* Standalone outputs (not linked to a specific stream, or all-streams) */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <h3 className="font-medium text-slate-900 mb-3">
                  Data Outputs ({outputConfigs.length})
                </h3>
                {outputConfigs.length > 0 ? (
                  <div className="space-y-2 text-sm">
                    {outputConfigs.map((output) => (
                      <div key={output.id} className="flex justify-between items-center">
                        <div>
                          <span className="font-medium">
                            {OUTPUT_DEST_OPTIONS.find((o) => o.key === output.destType)?.label}
                          </span>
                          <span className="text-slate-500 ml-2">
                            {output.streamRef
                              ? inputConfigs.find((i) => i.streamSlug === output.streamRef)?.streamName ?? output.streamRef
                              : "No store linked"}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {output.destType === "api-serve"
                            ? "Always on"
                            : TRIGGER_OPTIONS.find((t) => t.value === output.trigger)?.label ?? output.trigger}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No output destinations configured</p>
                )}
              </div>
            </div>
          )}

          {/* ---- Footer ---- */}
          <DialogFooter className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                Cancel
              </Button>
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={isLoading || isStepTransitioning}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {currentStep === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateNow}
                  disabled={isLoading || isSlugChecking || isStepTransitioning}
                >
                  {isLoading ? "Creating..." : "Create Now"}
                </Button>
              )}
              {isLastStep ? (
                <Button
                  type="submit"
                  disabled={isLoading || isSlugChecking || isStepTransitioning}
                >
                  {isLoading ? "Creating..." : "Create Space"}
                </Button>
              ) : (
                <Button type="button" onClick={goNext} disabled={isLoading || isStepTransitioning}>
                  {(currentStep === 1 && inputConfigs.length === 0) || (currentStep === 2 && outputConfigs.length === 0) ? "Skip" : "Continue"}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

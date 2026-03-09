"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntegrationConfig {
  [key: string]: unknown;
}

interface ConfigFieldsProps {
  integrationKey: string;
  config: IntegrationConfig;
  onChange: (config: IntegrationConfig) => void;
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Secret Input
// ---------------------------------------------------------------------------

function SecretInput({
  value,
  onChange,
  placeholder,
  readOnly,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        tabIndex={-1}
      >
        {visible ? (
          <EyeOff className="w-4 h-4" />
        ) : (
          <Eye className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key-Value Editor
// ---------------------------------------------------------------------------

function KeyValueEditor({
  value,
  onChange,
  readOnly,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  readOnly?: boolean;
}) {
  const entries = Object.entries(value);

  const addEntry = () => {
    onChange({ ...value, "": "" });
  };

  const removeEntry = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  const updateEntry = (
    oldKey: string,
    newKey: string,
    newValue: string
  ) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === oldKey) {
        next[newKey] = newValue;
      } else {
        next[k] = v;
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, val], i) => (
        <div key={i} className="flex gap-2">
          <Input
            placeholder="Header name"
            value={key}
            onChange={(e) => updateEntry(key, e.target.value, val)}
            readOnly={readOnly}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={val}
            onChange={(e) => updateEntry(key, key, e.target.value)}
            readOnly={readOnly}
            className="flex-1"
          />
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => removeEntry(key)}
              className="shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addEntry}
          className="text-slate-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Header
        </Button>
      )}
      {entries.length === 0 && readOnly && (
        <p className="text-sm text-slate-400">No custom headers</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhook Output Config
// ---------------------------------------------------------------------------

function WebhookConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const url = String(config.url || "");
  const method = String(config.method || "POST");
  const signingSecret = String(config.signingSecret || "");
  const headers = (config.headers as Record<string, string>) || {};
  const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : 10000;
  const retryCount = typeof config.retryCount === "number" ? config.retryCount : 2;

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="Webhook URL" required hint="Must be a valid HTTP/HTTPS URL">
        <Input
          value={url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://example.com/webhook"
          readOnly={readOnly}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="HTTP Method">
          {readOnly ? (
            <Input value={method} readOnly />
          ) : (
            <Select value={method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Timeout (ms)" hint="1 - 120,000 ms">
          <Input
            type="number"
            value={timeoutMs}
            onChange={(e) => set("timeoutMs", parseInt(e.target.value) || 10000)}
            min={1}
            max={120000}
            readOnly={readOnly}
          />
        </Field>
      </div>

      <Field
        label="Signing Secret"
        hint="HMAC-SHA256 secret for payload verification. Sent as X-Aura-Signature header."
      >
        <SecretInput
          value={signingSecret}
          onChange={(v) => set("signingSecret", v)}
          placeholder="Optional HMAC secret"
          readOnly={readOnly}
        />
      </Field>

      <Field label="Retry Count" hint="Number of retries on failure (0-10)">
        <Input
          type="number"
          value={retryCount}
          onChange={(e) => set("retryCount", parseInt(e.target.value) || 0)}
          min={0}
          max={10}
          readOnly={readOnly}
        />
      </Field>

      <Field label="Custom Headers" hint="Additional HTTP headers to include in the request">
        <KeyValueEditor
          value={headers}
          onChange={(v) => set("headers", v)}
          readOnly={readOnly}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blockchain Output Config
// ---------------------------------------------------------------------------

function BlockchainOutputConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const blockchain = String(config.blockchain || "avalanche");
  const rpcUrl = String(config.rpcUrl || "");
  const chainId = typeof config.chainId === "number" ? config.chainId : "";
  const contractAddress = String(config.contractAddress || "");
  const writeMode = String(config.writeMode || "por_value");
  const valueDecimals = typeof config.valueDecimals === "number" ? config.valueDecimals : 18;
  const signerPrivateKey = String(config.signerPrivateKey || "");

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Blockchain" required>
          {readOnly ? (
            <Input value={blockchain} readOnly className="capitalize" />
          ) : (
            <Select value={blockchain} onValueChange={(v) => set("blockchain", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="avalanche">Avalanche C-Chain</SelectItem>
                <SelectItem value="ethereum">Ethereum</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Write Mode" required>
          {readOnly ? (
            <Input value={writeMode === "merkle_root" ? "Merkle Root" : "PoR Value"} readOnly />
          ) : (
            <Select value={writeMode} onValueChange={(v) => set("writeMode", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="por_value">PoR Value</SelectItem>
                <SelectItem value="merkle_root">Merkle Root</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <Field label="RPC URL" required hint="JSON-RPC endpoint for the blockchain">
        <Input
          value={rpcUrl}
          onChange={(e) => set("rpcUrl", e.target.value)}
          placeholder="https://api.avax.network/ext/bc/C/rpc"
          readOnly={readOnly}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Chain ID">
          <Input
            type="number"
            value={chainId}
            onChange={(e) => set("chainId", parseInt(e.target.value) || 0)}
            placeholder="43114"
            readOnly={readOnly}
          />
        </Field>

        <Field label="Value Decimals" hint="Token decimals (0-36)">
          <Input
            type="number"
            value={valueDecimals}
            onChange={(e) => set("valueDecimals", parseInt(e.target.value) || 18)}
            min={0}
            max={36}
            readOnly={readOnly}
          />
        </Field>
      </div>

      <Field label="Contract Address" required hint="0x-prefixed smart contract address">
        <Input
          value={contractAddress}
          onChange={(e) => set("contractAddress", e.target.value)}
          placeholder="0x..."
          readOnly={readOnly}
          className="font-mono text-sm"
        />
      </Field>

      <Field
        label="Signer Private Key"
        hint="Leave empty to use the server-side environment variable. Never share this key."
      >
        <SecretInput
          value={signerPrivateKey}
          onChange={(v) => set("signerPrivateKey", v)}
          placeholder="0x... (optional, uses env var if empty)"
          readOnly={readOnly}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RWA.xyz Output Config
// ---------------------------------------------------------------------------

function RwaXyzConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const apiKey = String(config.apiKey || "");
  const assetId = String(config.assetId || "");
  const navPerToken = typeof config.navPerToken === "number" ? config.navPerToken : 1;
  const retryCount = typeof config.retryCount === "number" ? config.retryCount : 2;

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="API Key" required hint="Your RWA.xyz API key for authentication">
        <SecretInput
          value={apiKey}
          onChange={(v) => set("apiKey", v)}
          placeholder="Enter your RWA.xyz API key"
          readOnly={readOnly}
        />
      </Field>

      <Field label="Asset ID" required hint="The RWA.xyz asset identifier to sync metrics to">
        <Input
          value={assetId}
          onChange={(e) => set("assetId", e.target.value)}
          placeholder="e.g., asset_abc123"
          readOnly={readOnly}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="NAV per Token" hint="Net Asset Value per token (used to calculate AUM)">
          <Input
            type="number"
            step="any"
            value={navPerToken}
            onChange={(e) => set("navPerToken", parseFloat(e.target.value) || 1)}
            readOnly={readOnly}
          />
        </Field>

        <Field label="Retry Count" hint="0-10 retries on failure">
          <Input
            type="number"
            value={retryCount}
            onChange={(e) => set("retryCount", parseInt(e.target.value) || 0)}
            min={0}
            max={10}
            readOnly={readOnly}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Input Config
// ---------------------------------------------------------------------------

function ApiInputConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const url = String(config.url || "");
  const method = String(config.method || "GET");
  const authType = String(config.authType || "none");
  const authValue = String(config.authValue || "");
  const authHeaderName = String(config.authHeaderName || "x-api-key");
  const responsePath = String(config.responsePath || "");
  const bodyTemplate = String(config.bodyTemplate || "");
  const timeoutMs = typeof config.timeoutMs === "number" ? config.timeoutMs : 10000;
  const retryCount = typeof config.retryCount === "number" ? config.retryCount : 1;
  const retryDelayMs = typeof config.retryDelayMs === "number" ? config.retryDelayMs : 500;
  const valueTransform = typeof config.valueTransform === "number" ? config.valueTransform : 1;

  const set = (key: string, value: unknown) => onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="API URL" required hint="The HTTP endpoint to fetch data from">
        <Input
          value={url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://api.example.com/data"
          readOnly={readOnly}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="HTTP Method">
          {readOnly ? (
            <Input value={method} readOnly />
          ) : (
            <Select value={method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Authentication">
          {readOnly ? (
            <Input value={authType === "none" ? "None" : authType} readOnly className="capitalize" />
          ) : (
            <Select value={authType} onValueChange={(v) => set("authType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="bearer">Bearer Token</SelectItem>
                <SelectItem value="basic">Basic Auth</SelectItem>
                <SelectItem value="api_key">API Key Header</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      {authType !== "none" && (
        <div className={authType === "api_key" ? "grid grid-cols-2 gap-4" : ""}>
          <Field
            label={
              authType === "bearer"
                ? "Bearer Token"
                : authType === "basic"
                  ? "Base64 Credentials"
                  : "API Key Value"
            }
            required
          >
            <SecretInput
              value={authValue}
              onChange={(v) => set("authValue", v)}
              placeholder={
                authType === "bearer"
                  ? "Enter bearer token"
                  : authType === "basic"
                    ? "Base64-encoded user:password"
                    : "Enter API key"
              }
              readOnly={readOnly}
            />
          </Field>

          {authType === "api_key" && (
            <Field label="Header Name" hint="Custom header name for the API key">
              <Input
                value={authHeaderName}
                onChange={(e) => set("authHeaderName", e.target.value)}
                placeholder="x-api-key"
                readOnly={readOnly}
              />
            </Field>
          )}
        </div>
      )}

      <Field
        label="Response Path"
        required
        hint="Dot-notation path to extract the numeric value from the JSON response (e.g. data.results.0.value)"
      >
        <Input
          value={responsePath}
          onChange={(e) => set("responsePath", e.target.value)}
          placeholder="data.price"
          readOnly={readOnly}
          className="font-mono text-sm"
        />
      </Field>

      {method === "POST" && (
        <Field label="Request Body Template" hint="JSON body to send with the POST request">
          <Textarea
            value={bodyTemplate}
            onChange={(e) => set("bodyTemplate", e.target.value)}
            placeholder='{"query": "..."}'
            readOnly={readOnly}
            className="font-mono text-sm h-24"
          />
        </Field>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Field label="Timeout (ms)">
          <Input
            type="number"
            value={timeoutMs}
            onChange={(e) => set("timeoutMs", parseInt(e.target.value) || 10000)}
            min={1}
            max={120000}
            readOnly={readOnly}
          />
        </Field>

        <Field label="Retries">
          <Input
            type="number"
            value={retryCount}
            onChange={(e) => set("retryCount", parseInt(e.target.value) || 0)}
            min={0}
            max={10}
            readOnly={readOnly}
          />
        </Field>

        <Field label="Retry Delay (ms)">
          <Input
            type="number"
            value={retryDelayMs}
            onChange={(e) => set("retryDelayMs", parseInt(e.target.value) || 500)}
            min={0}
            max={60000}
            readOnly={readOnly}
          />
        </Field>
      </div>

      <Field
        label="Value Multiplier"
        hint="Multiply the extracted value by this factor (e.g., 0.001 to convert grams to kg)"
      >
        <Input
          type="number"
          step="any"
          value={valueTransform}
          onChange={(e) => set("valueTransform", parseFloat(e.target.value) || 1)}
          readOnly={readOnly}
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blockchain RPC defaults
// ---------------------------------------------------------------------------

const AVALANCHE_MAINNET = {
  rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
  chainId: 43114,
  label: "Avalanche C-Chain",
};

const AVALANCHE_TESTNET = {
  rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
  chainId: 43113,
  label: "Avalanche Fuji Testnet",
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// ---------------------------------------------------------------------------
// Blockchain Input Config
// ---------------------------------------------------------------------------

function BlockchainInputConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const fetchType = String(config.fetchType || "wallet_balance");
  const isTestnet = !!config.isTestnet;
  const rpcUrl = String(config.rpcUrl || "");
  const chainId = typeof config.chainId === "number" ? config.chainId : "";
  const tokenAddress = String(config.tokenAddress || "");
  const walletAddress = String(config.walletAddress || "");
  const decimals = typeof config.decimals === "number" ? config.decimals : 18;
  const abiJson = typeof config.abiJson === "string" ? config.abiJson : config.abiJson ? JSON.stringify(config.abiJson, null, 2) : "";
  const functionName = String(config.functionName || "");
  const functionArgs = typeof config.functionArgs === "string" ? config.functionArgs : config.functionArgs ? JSON.stringify(config.functionArgs) : "";
  const resultIndex = typeof config.resultIndex === "number" ? config.resultIndex : "";

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [decimalsLoading, setDecimalsLoading] = useState(false);
  const [decimalsStatus, setDecimalsStatus] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceResult, setBalanceResult] = useState<{
    balance: string;
    symbol?: string;
    isNative: boolean;
  } | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Track last fetched values to avoid duplicate requests
  const lastDecimalsFetch = useRef<string>("");
  const lastBalanceFetch = useRef<string>("");

  const set = useCallback(
    (key: string, value: unknown) => onChange({ ...config, [key]: value }),
    [config, onChange]
  );

  const setMultiple = useCallback(
    (updates: Record<string, unknown>) => onChange({ ...config, ...updates }),
    [config, onChange]
  );

  // Get the effective RPC URL
  const effectiveRpcUrl = rpcUrl || (isTestnet ? AVALANCHE_TESTNET.rpcUrl : AVALANCHE_MAINNET.rpcUrl);

  // When blockchain network changes, update RPC URL and chain ID
  const handleNetworkChange = useCallback(
    (testnet: boolean) => {
      const network = testnet ? AVALANCHE_TESTNET : AVALANCHE_MAINNET;
      setMultiple({
        isTestnet: testnet,
        rpcUrl: network.rpcUrl,
        chainId: network.chainId,
        blockchain: "avalanche",
      });
    },
    [setMultiple]
  );

  // Initialize defaults on first render if not set
  useEffect(() => {
    if (readOnly) return;
    const updates: Record<string, unknown> = {};
    if (!config.blockchain) updates.blockchain = "avalanche";
    if (!config.rpcUrl) updates.rpcUrl = isTestnet ? AVALANCHE_TESTNET.rpcUrl : AVALANCHE_MAINNET.rpcUrl;
    if (config.chainId === undefined) updates.chainId = isTestnet ? AVALANCHE_TESTNET.chainId : AVALANCHE_MAINNET.chainId;
    if (Object.keys(updates).length > 0) {
      onChange({ ...config, ...updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch token decimals when token address is pasted
  useEffect(() => {
    if (readOnly || !tokenAddress || !ADDRESS_REGEX.test(tokenAddress)) {
      setDecimalsStatus(null);
      return;
    }
    const fetchKey = `${effectiveRpcUrl}:${tokenAddress}`;
    if (fetchKey === lastDecimalsFetch.current) return;

    const timer = setTimeout(async () => {
      lastDecimalsFetch.current = fetchKey;
      setDecimalsLoading(true);
      setDecimalsStatus(null);
      try {
        const res = await fetch("/api/blockchain/token-decimals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rpcUrl: effectiveRpcUrl, tokenAddress }),
        });
        if (res.ok) {
          const data = await res.json();
          set("decimals", data.decimals);
          setDecimalsStatus(`Detected ${data.decimals} decimals`);
        } else {
          const data = await res.json().catch(() => ({}));
          setDecimalsStatus(data.error || "Could not read decimals");
        }
      } catch {
        setDecimalsStatus("Failed to fetch decimals");
      }
      setDecimalsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [tokenAddress, effectiveRpcUrl, readOnly, set]);

  // Auto-fetch balance when wallet address is entered
  useEffect(() => {
    if (readOnly || fetchType !== "wallet_balance" || !walletAddress || !ADDRESS_REGEX.test(walletAddress)) {
      setBalanceResult(null);
      setBalanceError(null);
      return;
    }
    const fetchKey = `${effectiveRpcUrl}:${tokenAddress}:${walletAddress}:${decimals}`;
    if (fetchKey === lastBalanceFetch.current) return;

    const timer = setTimeout(async () => {
      lastBalanceFetch.current = fetchKey;
      setBalanceLoading(true);
      setBalanceResult(null);
      setBalanceError(null);
      try {
        const res = await fetch("/api/blockchain/balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rpcUrl: effectiveRpcUrl,
            walletAddress,
            tokenAddress: tokenAddress || undefined,
            decimals,
            fetchType: "wallet_balance",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setBalanceResult({
            balance: data.balance,
            symbol: data.symbol,
            isNative: data.isNative,
          });
        } else {
          const data = await res.json().catch(() => ({}));
          setBalanceError(data.error || "Could not fetch balance");
        }
      } catch {
        setBalanceError("Failed to fetch balance");
      }
      setBalanceLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, [walletAddress, tokenAddress, effectiveRpcUrl, decimals, fetchType, readOnly]);

  if (readOnly) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Network">
            <Input
              value={isTestnet ? "Avalanche Fuji (Testnet)" : "Avalanche C-Chain"}
              readOnly
            />
          </Field>
          <Field label="Fetch Type">
            <Input
              value={
                fetchType === "wallet_balance"
                  ? "Wallet Balance"
                  : fetchType === "total_supply"
                    ? "Total Supply"
                    : "Contract Read"
              }
              readOnly
            />
          </Field>
        </div>

        <Field label="RPC URL">
          <Input value={rpcUrl || effectiveRpcUrl} readOnly className="font-mono text-sm" />
        </Field>

        {tokenAddress && (
          <Field label="Token Address">
            <Input value={tokenAddress} readOnly className="font-mono text-sm" />
          </Field>
        )}

        {fetchType === "wallet_balance" && walletAddress && (
          <Field label="Wallet Address">
            <Input value={walletAddress} readOnly className="font-mono text-sm" />
          </Field>
        )}

        <Field label="Decimals">
          <Input value={String(decimals)} readOnly />
        </Field>

        {fetchType === "contract_read" && (
          <>
            {abiJson && (
              <Field label="Contract ABI">
                <Textarea value={String(abiJson)} readOnly className="font-mono text-xs h-28" />
              </Field>
            )}
            {functionName && (
              <Field label="Function Name">
                <Input value={functionName} readOnly className="font-mono text-sm" />
              </Field>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Network + Fetch Type */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Network" required>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={isTestnet ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-200"}
            >
              {isTestnet ? "Testnet" : "Mainnet"}
            </Badge>
            <span className="text-sm text-slate-700">
              {isTestnet ? AVALANCHE_TESTNET.label : AVALANCHE_MAINNET.label}
            </span>
          </div>
        </Field>

        <Field label="Fetch Type" required>
          <Select value={fetchType} onValueChange={(v) => set("fetchType", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wallet_balance">Wallet Balance</SelectItem>
              <SelectItem value="total_supply">Total Supply</SelectItem>
              <SelectItem value="contract_read">Contract Read</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Token Address (optional for wallet_balance) */}
      <Field
        label="Token Address"
        required={fetchType !== "wallet_balance"}
        hint={
          fetchType === "wallet_balance"
            ? "Leave empty to read native AVAX balance. Paste an ERC-20 address to read token balance."
            : "ERC-20 token or contract address"
        }
      >
        <Input
          value={tokenAddress}
          onChange={(e) => set("tokenAddress", e.target.value)}
          placeholder="0x... (optional for native AVAX)"
          className="font-mono text-sm"
        />
        {/* Decimals auto-detection status */}
        {decimalsLoading && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Reading token decimals...
          </div>
        )}
        {!decimalsLoading && decimalsStatus && (
          <div className={`flex items-center gap-1.5 text-xs mt-1 ${
            decimalsStatus.startsWith("Detected") ? "text-green-600" : "text-amber-600"
          }`}>
            {decimalsStatus.startsWith("Detected") ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertCircle className="w-3 h-3" />
            )}
            {decimalsStatus}
          </div>
        )}
      </Field>

      {/* Wallet Address */}
      {fetchType === "wallet_balance" && (
        <Field label="Wallet Address" required hint="The wallet address to check balance for">
          <Input
            value={walletAddress}
            onChange={(e) => set("walletAddress", e.target.value)}
            placeholder="0x..."
            className="font-mono text-sm"
          />
          {/* Live balance preview */}
          {balanceLoading && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Fetching balance...
            </div>
          )}
          {!balanceLoading && balanceResult && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 mt-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>
                Current balance: <strong>{Number(balanceResult.balance).toLocaleString(undefined, { maximumFractionDigits: 8 })}</strong>
                {balanceResult.symbol ? ` ${balanceResult.symbol}` : balanceResult.isNative ? " AVAX" : ""}
              </span>
            </div>
          )}
          {!balanceLoading && balanceError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 mt-1">
              <AlertCircle className="w-3 h-3" />
              {balanceError}
            </div>
          )}
        </Field>
      )}

      {/* Advanced Options Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        Advanced Options
      </button>

      {showAdvanced && (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {/* Testnet toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Use Testnet</Label>
              <p className="text-xs text-slate-500">
                Switch to Avalanche Fuji testnet for testing
              </p>
            </div>
            <Switch
              checked={isTestnet}
              onCheckedChange={handleNetworkChange}
            />
          </div>

          <Field label="RPC URL" hint="Custom JSON-RPC endpoint (auto-configured by default)">
            <Input
              value={rpcUrl}
              onChange={(e) => set("rpcUrl", e.target.value)}
              placeholder={isTestnet ? AVALANCHE_TESTNET.rpcUrl : AVALANCHE_MAINNET.rpcUrl}
              className="font-mono text-sm"
            />
          </Field>

          <Field label="Chain ID" hint="Override the chain ID if using a custom network">
            <Input
              type="number"
              value={chainId}
              onChange={(e) => set("chainId", parseInt(e.target.value) || 0)}
              placeholder={String(isTestnet ? AVALANCHE_TESTNET.chainId : AVALANCHE_MAINNET.chainId)}
            />
          </Field>

          <Field label="Token Decimals" hint="Auto-detected from token contract. Override if needed (0-18).">
            <Input
              type="number"
              value={decimals}
              onChange={(e) => set("decimals", parseInt(e.target.value) || 18)}
              min={0}
              max={18}
            />
          </Field>
        </div>
      )}

      {/* Contract Read fields */}
      {fetchType === "contract_read" && (
        <>
          <Field label="Contract ABI" required hint="JSON ABI array for the contract function">
            <Textarea
              value={String(abiJson)}
              onChange={(e) => set("abiJson", e.target.value)}
              placeholder='[{"inputs":[],"name":"getReserve","outputs":[{"type":"uint256"}],"stateMutability":"view","type":"function"}]'
              className="font-mono text-xs h-28"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Function Name" required>
              <Input
                value={functionName}
                onChange={(e) => set("functionName", e.target.value)}
                placeholder="getReserve"
                className="font-mono text-sm"
              />
            </Field>

            <Field label="Result Index" hint="Index if function returns multiple values">
              <Input
                type="number"
                value={resultIndex}
                onChange={(e) => {
                  const v = e.target.value;
                  set("resultIndex", v === "" ? undefined : parseInt(v));
                }}
                min={0}
              />
            </Field>
          </div>

          <Field label="Function Arguments" hint="JSON array of arguments to pass">
            <Input
              value={String(functionArgs)}
              onChange={(e) => set("functionArgs", e.target.value)}
              placeholder='["0x...", 42]'
              className="font-mono text-sm"
            />
          </Field>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// API Serve Config (simplified - handled by detail page)
// ---------------------------------------------------------------------------

function ApiServeConfigFields({
  config,
  onChange,
  readOnly,
}: Omit<ConfigFieldsProps, "integrationKey">) {
  const isPublic = !!config.isPublic;

  return (
    <div className="space-y-4">
      <Field label="Access Mode" hint="Controls whether an API key is required">
        {readOnly ? (
          <Input value={isPublic ? "Public (no API key required)" : "Restricted (API key required)"} readOnly />
        ) : (
          <Select
            value={isPublic ? "public" : "restricted"}
            onValueChange={(v) => onChange({ ...config, isPublic: v === "public" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">Public (no API key required)</SelectItem>
              <SelectItem value="restricted">Restricted (API key required)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Renders integration-specific config form fields.
 * Returns null for integration types that don't have configurable fields (e.g., manual).
 */
export function IntegrationConfigFields({
  integrationKey,
  config,
  onChange,
  readOnly,
}: ConfigFieldsProps) {
  const key = integrationKey.toLowerCase();

  switch (key) {
    case "webhook":
      return <WebhookConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    case "avalanche":
    case "ethereum":
      // Check direction by looking for config keys
      if ("writeMode" in config || "signerPrivateKey" in config || "contractAddress" in config) {
        return <BlockchainOutputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
      }
      return <BlockchainInputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    case "blockchain-read":
      return <BlockchainInputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    case "rwa-xyz":
    case "rwa_xyz":
      return <RwaXyzConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    case "api-fetch":
    case "api":
      return <ApiInputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    case "api-serve":
      return <ApiServeConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    default:
      return null;
  }
}

/**
 * Returns true if the integration key has configurable fields.
 */
export function hasConfigFields(integrationKey: string): boolean {
  const key = integrationKey.toLowerCase();
  return [
    "webhook",
    "avalanche",
    "ethereum",
    "blockchain-read",
    "rwa-xyz",
    "rwa_xyz",
    "api-fetch",
    "api",
    "api-serve",
  ].includes(key);
}

/**
 * For distinguishing input vs output blockchain integrations.
 */
export function IntegrationConfigFieldsWithDirection({
  integrationKey,
  direction,
  config,
  onChange,
  readOnly,
}: ConfigFieldsProps & { direction: "input" | "output" }) {
  const key = integrationKey.toLowerCase();

  if (key === "avalanche" || key === "ethereum") {
    if (direction === "output") {
      return <BlockchainOutputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
    }
    return <BlockchainInputConfigFields config={config} onChange={onChange} readOnly={readOnly} />;
  }

  return (
    <IntegrationConfigFields
      integrationKey={integrationKey}
      config={config}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
}

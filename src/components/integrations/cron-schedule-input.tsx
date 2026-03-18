"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS = [
  { label: "Every minute", cron: "* * * * *" },
  { label: "Every 5 minutes", cron: "*/5 * * * *" },
  { label: "Every 15 minutes", cron: "*/15 * * * *" },
  { label: "Every 30 minutes", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
  { label: "Every 12 hours", cron: "0 */12 * * *" },
  { label: "Daily (midnight)", cron: "0 0 * * *" },
  { label: "Weekly (Monday midnight)", cron: "0 0 * * 1" },
  { label: "Monthly (1st, midnight)", cron: "0 0 1 * *" },
];

const PRESET_MAP = new Map<string, string>(
  PRESETS.map((p) => [p.cron, p.label])
);

interface CronScheduleInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function CronScheduleInput({
  value,
  onChange,
  label,
}: CronScheduleInputProps) {
  const isPreset = PRESET_MAP.has(value);
  const [advanced, setAdvanced] = useState(!isPreset && value !== "");

  // If value changes externally to a preset, switch back to easy mode
  useEffect(() => {
    if (PRESET_MAP.has(value)) {
      setAdvanced(false);
    }
  }, [value]);

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm">{label}</Label>}

      {!advanced ? (
        <>
          <Select
            value={isPreset ? value : ""}
            onValueChange={(v) => {
              if (v === "__advanced__") {
                setAdvanced(true);
              } else {
                onChange(v);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a schedule" />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.cron} value={p.cron}>
                  {p.label}
                </SelectItem>
              ))}
              <SelectItem value="__advanced__">
                Custom cron expression...
              </SelectItem>
            </SelectContent>
          </Select>
          {isPreset && (
            <p className="text-xs text-slate-500 font-mono">{value}</p>
          )}
        </>
      ) : (
        <>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="0 */6 * * *"
            className="font-mono text-sm"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Format: <code>min hour day month weekday</code>
            </p>
            <button
              type="button"
              onClick={() => setAdvanced(false)}
              className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
              Use preset
            </button>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AssetType } from "@/lib/entities";
import type { AssetType as AssetTypeType } from "@/lib/entities/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssetTypeIcon } from "./asset-type-icon";

const OTHER_VALUE = "__other__";

interface AssetTypeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function AssetTypeSelect({
  value,
  onValueChange,
  placeholder = "Select asset type...",
  required = false,
}: AssetTypeSelectProps) {
  const [assetTypes, setAssetTypes] = useState<AssetTypeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOther, setIsOther] = useState(false);
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    AssetType.list("label")
      .then((types) => {
        setAssetTypes(types);
        // If current value doesn't match any known type, it's a custom/other value
        if (value && types.length > 0 && !types.some((t) => t.value === value)) {
          setIsOther(true);
          setCustomValue(value);
        }
      })
      .catch(() => setAssetTypes([]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount; value is checked in the sync effect below
  }, []);

  // Sync: if value is set externally and matches a known type, switch back from "other"
  useEffect(() => {
    if (!loading && value && assetTypes.some((t) => t.value === value)) {
      setIsOther(false);
      setCustomValue("");
    }
  }, [value, assetTypes, loading]);

  const handleSelectChange = (selected: string) => {
    if (selected === OTHER_VALUE) {
      setIsOther(true);
      setCustomValue("");
      onValueChange("");
    } else {
      setIsOther(false);
      setCustomValue("");
      onValueChange(selected);
    }
  };

  const handleCustomChange = (custom: string) => {
    setCustomValue(custom);
    onValueChange(custom);
  };

  if (loading) {
    return (
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Loading..." />
        </SelectTrigger>
        <SelectContent>
          <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
        </SelectContent>
      </Select>
    );
  }

  const selectValue = isOther ? OTHER_VALUE : value || "";

  return (
    <div className="space-y-2">
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {assetTypes.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              <span className="flex items-center gap-2">
                <AssetTypeIcon icon={type.icon} className="w-4 h-4 text-slate-500" />
                {type.label}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={OTHER_VALUE}>
            <span className="text-slate-500">Other...</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {isOther && (
        <Input
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="Enter custom asset type..."
          required={required}
          autoFocus
        />
      )}
    </div>
  );
}

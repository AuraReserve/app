"use client";

import React, { useState, useEffect } from "react";
import { twoFactor } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Copy, RefreshCw, Key, Eye, EyeOff } from "lucide-react";

interface BackupCodesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = "view" | "regenerate" | "confirm-regenerate";

export function BackupCodesDialog({ open, onOpenChange }: BackupCodesDialogProps) {
  const [mode, setMode] = useState<ViewMode>("view");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codesRevealed, setCodesRevealed] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setMode("view");
        setError(null);
        setBackupCodes([]);
        setPassword("");
        setShowPassword(false);
        setCopied(false);
        setCodesRevealed(false);
      }, 200);
    }
  }, [open]);

  const handleViewCodes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Note: Better Auth may require password verification to view backup codes
      // For now, we'll just reveal the codes
      setCodesRevealed(true);
    } catch (err) {
      console.error("Error viewing backup codes:", err);
      setError("Failed to retrieve backup codes");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateCodes = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await twoFactor.generateBackupCodes({
        password: password,
      });

      if (result.error) {
        setError(result.error.message || "Failed to regenerate backup codes");
        setIsLoading(false);
        return;
      }

      if (result.data?.backupCodes) {
        setBackupCodes(result.data.backupCodes);
        setMode("view");
        setCodesRevealed(true);
        setPassword("");
      }
    } catch (err) {
      console.error("Error regenerating backup codes:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    const codesText = backupCodes.join("\n");
    await navigator.clipboard.writeText(codesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderContent = () => {
    switch (mode) {
      case "view":
        return (
          <div className="space-y-6">
            {backupCodes.length > 0 ? (
              <>
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    These are your backup codes. Each code can only be used once.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg border">
                  <div className="grid grid-cols-2 gap-2">
                    {backupCodes.map((code, index) => (
                      <code
                        key={index}
                        className="px-3 py-2 bg-white rounded border text-sm font-mono text-center"
                      >
                        {codesRevealed ? code : "****-****-**"}
                      </code>
                    ))}
                  </div>
                </div>

                {codesRevealed && (
                  <Button variant="outline" className="w-full" onClick={handleCopyBackupCodes}>
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy All Codes
                      </>
                    )}
                  </Button>
                )}

                {!codesRevealed && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleViewCodes}
                    disabled={isLoading}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Reveal Codes
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center space-y-4 py-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
                  <Key className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No backup codes available. Generate new backup codes to ensure you can access your
                  account if you lose your authenticator device.
                </p>
              </div>
            )}

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Keep your backup codes secure. Anyone with these codes can access your account.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMode("confirm-regenerate")}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            </div>
          </div>
        );

      case "confirm-regenerate":
        return (
          <div className="space-y-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Regenerating backup codes will invalidate all existing codes. Make sure you have
                access to your authenticator app before proceeding.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setMode("view")}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => setMode("regenerate")}
              >
                I Understand, Continue
              </Button>
            </div>
          </div>
        );

      case "regenerate":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter your password to generate new backup codes
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setMode("view");
                  setPassword("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={handleRegenerateCodes}
                disabled={isLoading || !password}
              >
                {isLoading ? "Generating..." : "Generate New Codes"}
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Backup Codes</DialogTitle>
          <DialogDescription>
            Use backup codes to sign in when you don&apos;t have access to your authenticator app
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}

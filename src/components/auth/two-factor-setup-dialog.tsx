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
import { AlertCircle, CheckCircle2, Copy, Shield, Smartphone, Key } from "lucide-react";

interface TwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SetupStep = "intro" | "qr" | "verify" | "backup" | "complete";

export function TwoFactorSetupDialog({
  open,
  onOpenChange,
  onSuccess,
}: TwoFactorSetupDialogProps) {
  const [step, setStep] = useState<SetupStep>("intro");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("intro");
        setError(null);
        setTotpURI(null);
        setSecret(null);
        setVerificationCode("");
        setBackupCodes([]);
        setCopied(false);
        setPassword("");
      }, 200);
    }
  }, [open]);

  const handleStartSetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await twoFactor.enable({
        password,
      });

      if (result.error) {
        setError(result.error.message || "Failed to start 2FA setup");
        setIsLoading(false);
        return;
      }

      if (result.data?.totpURI) {
        setTotpURI(result.data.totpURI);
        // Extract secret from URI
        const secretMatch = result.data.totpURI.match(/secret=([^&]+)/);
        if (secretMatch) {
          setSecret(secretMatch[1]);
        }
        setStep("qr");
      }

      if (result.data?.backupCodes) {
        setBackupCodes(result.data.backupCodes);
      }
    } catch (err) {
      console.error("2FA setup error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await twoFactor.verifyTotp({
        code: verificationCode.trim(),
      });

      if (result.error) {
        setError(result.error.message || "Invalid verification code");
        setIsLoading(false);
        return;
      }

      // Move to backup codes step
      setStep("backup");
    } catch (err) {
      console.error("2FA verification error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (secret) {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyBackupCodes = async () => {
    const codesText = backupCodes.join("\n");
    await navigator.clipboard.writeText(codesText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleComplete = () => {
    setStep("complete");
    setTimeout(() => {
      onOpenChange(false);
      onSuccess?.();
    }, 1500);
  };

  const renderStep = () => {
    switch (step) {
      case "intro":
        return (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Shield className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Enhance Your Security</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Two-factor authentication adds an extra layer of security to your account by
                  requiring a code from your authenticator app when signing in.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <Smartphone className="w-5 h-5 text-slate-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Authenticator App Required</p>
                  <p className="text-slate-600">
                    You&apos;ll need an authenticator app like Google Authenticator, Authy, or 1Password.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                <Key className="w-5 h-5 text-slate-600 mt-0.5" />
                <div>
                  <p className="font-medium text-slate-900">Backup Codes</p>
                  <p className="text-slate-600">
                    You&apos;ll receive backup codes for emergency access if you lose your device.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="2fa-password">Confirm Your Password</Label>
              <Input
                id="2fa-password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={handleStartSetup}
                disabled={isLoading || !password}
              >
                {isLoading ? "Setting up..." : "Continue"}
              </Button>
            </div>
          </div>
        );

      case "qr":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Scan QR Code</h3>
              <p className="text-sm text-muted-foreground">
                Scan this QR code with your authenticator app
              </p>
            </div>

            {totpURI && (
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-white rounded-lg border">
{/* eslint-disable-next-line @next/next/no-img-element -- external QR code API, not a static asset */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpURI)}`}
                    alt="2FA QR Code"
                    width={200}
                    height={200}
                    className="rounded"
                  />
                </div>

                <div className="w-full space-y-2">
                  <p className="text-xs text-muted-foreground text-center">
                    Or enter this code manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono text-center select-all break-all">
                      {secret}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopySecret}
                    >
                      {copied ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={() => setStep("verify")}
            >
              Continue
            </Button>
          </div>
        );

      case "verify":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Verify Setup</h3>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="verify-code">Verification Code</Label>
              <Input
                id="verify-code"
                type="text"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-widest font-mono"
                autoComplete="one-time-code"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("qr")}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                onClick={handleVerify}
                disabled={isLoading || verificationCode.length < 6}
              >
                {isLoading ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </div>
        );

      case "backup":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Save Your Backup Codes</h3>
              <p className="text-sm text-muted-foreground">
                Store these codes in a safe place. You can use them to sign in if you lose access to
                your authenticator app.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, index) => (
                  <code
                    key={index}
                    className="px-3 py-2 bg-white rounded border text-sm font-mono text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyBackupCodes}
            >
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

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Each backup code can only be used once. Keep them secure and accessible.
              </AlertDescription>
            </Alert>

            <Button
              className="w-full bg-amber-600 hover:bg-amber-700"
              onClick={handleComplete}
            >
              I&apos;ve Saved My Codes
            </Button>
          </div>
        );

      case "complete":
        return (
          <div className="flex flex-col items-center text-center space-y-4 py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">2FA Enabled!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your account is now protected with two-factor authentication.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
          <DialogDescription>
            Protect your account with an additional layer of security
          </DialogDescription>
        </DialogHeader>
        {renderStep()}
      </DialogContent>
    </Dialog>
  );
}

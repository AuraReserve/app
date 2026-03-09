"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { twoFactor } from "@/lib/auth-client";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Shield, ArrowLeft, Key, Smartphone } from "lucide-react";

export default function TwoFactorVerification() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = useState(false);

  // Focus on the input field when component mounts
  useEffect(() => {
    const input = document.getElementById("totp-code");
    if (input) {
      input.focus();
    }
  }, [useBackupCode]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (useBackupCode) {
        const result = await twoFactor.verifyBackupCode({
          code: code.trim(),
        });

        if (result.error) {
          setError(result.error.message || "Invalid backup code");
          setIsLoading(false);
          return;
        }
      } else {
        const result = await twoFactor.verifyTotp({
          code: code.trim(),
        });

        if (result.error) {
          setError(result.error.message || "Invalid verification code");
          setIsLoading(false);
          return;
        }
      }

      // Successfully verified, redirect to callback URL
      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      console.error("2FA verification error:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric input for TOTP, alphanumeric for backup codes
    const value = e.target.value;
    if (useBackupCode) {
      setCode(value.toUpperCase());
    } else {
      setCode(value.replace(/\D/g, "").slice(0, 6));
    }
  };

  // Auto-submit when 6 digits entered for TOTP
  useEffect(() => {
    if (!useBackupCode && code.length === 6) {
      const form = document.getElementById("totp-form") as HTMLFormElement;
      if (form) {
        form.requestSubmit();
      }
    }
  }, [code, useBackupCode]);

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-brand relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(hsl(45 93% 47% / 0.5) 1px, transparent 1px),
                               linear-gradient(90deg, hsl(45 93% 47% / 0.5) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-amber-500/20 to-transparent rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-slate-600/30 to-transparent rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Image
                src="/icon_gold.svg"
                alt="AuraReserve"
                width={32}
                height={32}
                priority
              />
            </div>
            <div>
              <h2 className="text-xl font-bold">AuraReserve</h2>
              <p className="text-sm text-white/60">Web3 Reserve Platform</p>
            </div>
          </div>

          {/* Main content */}
          <div className="space-y-8">
            <div>
              <h1 className="text-5xl font-bold leading-tight">
                Secure Access
                <br />
                <span className="text-amber-400">Verification</span>
              </h1>
              <p className="text-xl text-white/70 mt-6 max-w-md">
                Two-factor authentication adds an extra layer of security to your account.
              </p>
            </div>

            {/* Security info */}
            <div className="space-y-4">
              {[
                "Time-based one-time passwords",
                "Backup codes for account recovery",
                "Industry-standard TOTP protocol",
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-white/80">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-white/40">
            Protecting your assets with enterprise-grade security
          </div>
        </div>
      </div>

      {/* Right side - Verification form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-radial">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Image
                  src="/icon_blue.svg"
                  alt="AuraReserve"
                  width={32}
                  height={32}
                  priority
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">AuraReserve</h2>
                <p className="text-sm text-muted-foreground">Web3 Reserve Platform</p>
              </div>
            </div>
          </div>

          <Card className="border-0 shadow-xl shadow-slate-200/50">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center gap-2 mb-2">
                <Link
                  href="/auth/signin"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
              <CardTitle className="text-2xl font-bold text-center">
                {useBackupCode ? "Enter Backup Code" : "Two-Factor Authentication"}
              </CardTitle>
              <CardDescription className="text-center">
                {useBackupCode
                  ? "Enter one of your backup codes to sign in"
                  : "Enter the 6-digit code from your authenticator app"}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {error && (
                <Alert variant="destructive" className="animate-scale-in">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form id="totp-form" onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="totp-code" className="text-sm font-medium">
                    {useBackupCode ? "Backup Code" : "Verification Code"}
                  </Label>
                  <div className="relative">
                    {useBackupCode ? (
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    )}
                    <Input
                      id="totp-code"
                      type="text"
                      placeholder={useBackupCode ? "XXXX-XXXX-XX" : "000000"}
                      value={code}
                      onChange={handleCodeChange}
                      required
                      disabled={isLoading}
                      autoComplete="one-time-code"
                      className={`pl-10 h-11 bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
                        useBackupCode ? "" : "text-center text-2xl tracking-widest font-mono"
                      }`}
                    />
                  </div>
                  {!useBackupCode && (
                    <p className="text-xs text-muted-foreground text-center">
                      Open your authenticator app to view your code
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={isLoading || (useBackupCode ? code.length < 8 : code.length < 6)}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : (
                    "Verify"
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-3 text-muted-foreground font-medium">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setCode("");
                  setError(null);
                }}
              >
                {useBackupCode ? (
                  <>
                    <Smartphone className="w-4 h-4 mr-2" />
                    Use authenticator app instead
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4 mr-2" />
                    Use a backup code
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground/70 mt-4">
            Lost access to your authenticator?{" "}
            <Link href="/auth/signin" className="text-amber-600 hover:text-amber-700">
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

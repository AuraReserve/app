"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from "next/image";
import { Mail, Lock, User, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

function validatePasswordClient(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters long");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain at least one uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain at least one lowercase letter");
  if (!/\d/.test(password)) errors.push("Password must contain at least one number");
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
    errors.push("Password must contain at least one special character");
  return errors;
}

function getPasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score++;
  return Math.min(4, score);
}

const strengthLabels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
const strengthColors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];

export default function SetupPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (!data.setupRequired) {
          router.replace("/auth/signin");
        } else {
          setIsChecking(false);
        }
      })
      .catch(() => {
        setError("Failed to check setup status");
        setIsChecking(false);
      });
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!formData.name.trim() || !formData.email.trim() || !formData.password) {
      setError("Please fill in all fields");
      setIsLoading(false);
      return;
    }

    const pwErrors = validatePasswordClient(formData.password);
    if (pwErrors.length > 0) {
      setError(pwErrors[0]);
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Setup failed");
      }

      setSuccess(true);
      setTimeout(() => router.push("/auth/signin"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-radial">
        <Card className="w-full max-w-md border-0 shadow-xl shadow-slate-200/50">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Checking setup status...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-brand relative overflow-hidden">
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

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Image src="/icon_gold.svg" alt="AuraReserve" width={32} height={32} priority />
            </div>
            <div>
              <h2 className="text-xl font-bold">AuraReserve</h2>
              <p className="text-sm text-white/60">Web3 Reserve Platform</p>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h1 className="text-5xl font-bold leading-tight">
                Welcome to
                <br />
                <span className="text-amber-400">AuraReserve</span>
              </h1>
              <p className="text-xl text-white/70 mt-6 max-w-md">
                Set up your platform by creating the first administrator account.
                This will be the owner account with full access.
              </p>
            </div>

            <div className="space-y-4">
              {[
                "Create the owner account",
                "Configure platform settings later",
                "Invite team members when ready",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-white/80">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-400">
                    {i + 1}
                  </div>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-sm text-white/40">Initial platform setup</div>
        </div>
      </div>

      {/* Right side - Setup form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-radial">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Image src="/icon_blue.svg" alt="AuraReserve" width={32} height={32} priority />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">AuraReserve</h2>
                <p className="text-sm text-muted-foreground">Web3 Reserve Platform</p>
              </div>
            </div>
          </div>

          <Card className="border-0 shadow-xl shadow-slate-200/50">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold text-center">Initial Setup</CardTitle>
              <CardDescription className="text-center">
                Create the owner account to get started
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {error && (
                <Alert variant="destructive" className="animate-scale-in">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-50 border-green-200 text-green-800 animate-scale-in">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Owner account created! Redirecting to sign in...
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Full Name
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Jane Doe"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      disabled={isLoading || success}
                      className="pl-10 h-11 bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">
                    Email address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={isLoading || success}
                      className="pl-10 h-11 bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="Enter a strong password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      disabled={isLoading || success}
                      className="pl-10 h-11 bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-amber-500/50"
                      minLength={8}
                    />
                  </div>
                  {formData.password && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1 flex-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                i < getPasswordStrength(formData.password)
                                  ? strengthColors[getPasswordStrength(formData.password)]
                                  : "bg-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {strengthLabels[getPasswordStrength(formData.password)]}
                        </span>
                      </div>
                      {validatePasswordClient(formData.password).length > 0 && (
                        <p className="text-xs text-red-500">
                          {validatePasswordClient(formData.password)[0]}
                        </p>
                      )}
                    </div>
                  )}
                  {!formData.password && (
                    <p className="text-xs text-muted-foreground">
                      8+ characters with uppercase, lowercase, number, and symbol
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      disabled={isLoading || success}
                      className="pl-10 h-11 bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full h-11" disabled={isLoading || success}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating account...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Create Owner Account
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground/70 mt-4">
            This page is only available during initial setup. Once the owner account is created, it will no longer be accessible.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Image from "next/image";
import { Mail, Lock, User, Building2, AlertCircle, CheckCircle2, Shield } from "lucide-react";
import type { Setting } from "@/lib/entities";
import { signUp } from "@/lib/auth-client";

/** Client-side password validation matching server-side requirements */
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

export default function SignUp() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    company: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSettings, setIsCheckingSettings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);

  useEffect(() => {
    checkSignupSettings();
  }, []);

  const checkSignupSettings = async () => {
    try {
      const response = await fetch("/api/settings?public=true");
      if (response.ok) {
        const settings: Setting[] = await response.json();
        const signupEnabled = settings.find((s) => s.key === "signup_enabled")?.value === "true";
        const selfRegistration = settings.find((s) => s.key === "allow_self_registration")?.value === "true";
        const emailVerification = settings.find((s) => s.key === "require_email_verification")?.value === "true";

        setSignupAllowed(signupEnabled && selfRegistration);
        setVerificationRequired(emailVerification);
      }
    } catch (err) {
      console.error("Error checking signup settings:", err);
    } finally {
      setIsCheckingSettings(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validation
    if (!formData.email || !formData.password || !formData.fullName) {
      setError("Please fill in all required fields");
      setIsLoading(false);
      return;
    }

    // Password strength validation (mirrors server-side requirements)
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
      // Use Better Auth's signUp method
      const result = await signUp.email({
        email: formData.email,
        password: formData.password,
        name: formData.fullName,
      });

      if (result.error) {
        throw new Error(result.error.message || "Failed to create account");
      }

      setSuccess(true);

      if (verificationRequired) {
        // Email verification required — stay on page and show message
        // Don't redirect; user needs to verify email first
      } else {
        // Better Auth auto-signs in the user, redirect to dashboard
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create account");
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="py-12 text-center">
            <p className="text-slate-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!signupAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-slate-500" />
            </div>
            <CardTitle className="text-2xl font-bold">Signup Disabled</CardTitle>
            <CardDescription>Self-registration is currently disabled</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                New account registration is currently disabled. Please contact an administrator to create an account for you.
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link href="/auth/signin">
              <Button variant="outline">Back to Sign In</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-16 h-16 flex items-center justify-center">
            <Image
              src="/icon_blue.svg"
              alt="AuraReserve"
              width={64}
              height={64}
              priority
            />
          </div>
          <CardTitle className="text-2xl font-bold">Create an Account</CardTitle>
          <CardDescription>Join AuraReserve to manage reserve audits</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && verificationRequired && (
            <Alert className="bg-blue-50 border-blue-200 text-blue-800">
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Account created! A verification email has been sent to <strong>{formData.email}</strong>.
                Please check your inbox and click the verification link before signing in.
              </AlertDescription>
            </Alert>
          )}

          {success && !verificationRequired && (
            <Alert className="bg-green-50 border-green-200 text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>Account created successfully! Redirecting to dashboard...</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  disabled={isLoading || success}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@company.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isLoading || success}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Company (Optional)</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="company"
                  name="company"
                  type="text"
                  placeholder="Acme Corp"
                  value={formData.company}
                  onChange={handleChange}
                  disabled={isLoading || success}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  disabled={isLoading || success}
                  className="pl-10"
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
                    <span className="text-xs text-slate-500">
                      {strengthLabels[getPasswordStrength(formData.password)]}
                    </span>
                  </div>
                  {validatePasswordClient(formData.password).length > 0 && (
                    <p className="text-xs text-red-500">{validatePasswordClient(formData.password)[0]}</p>
                  )}
                </div>
              )}
              {!formData.password && (
                <p className="text-xs text-slate-500">
                  8+ characters with uppercase, lowercase, number, and symbol
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirm Password <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={isLoading || success}
                  className="pl-10"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || success}>
              {isLoading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-center text-slate-600">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-blue-600 hover:underline font-medium">
              Sign in
            </Link>
          </div>
          <div className="text-xs text-center text-slate-500">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Shield } from "lucide-react";

export default function AuthError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const getErrorMessage = (error: string | null): { title: string; description: string } => {
    if (!error) return { title: "Unknown Error", description: "An unknown error occurred" };

    const errorMessages: Record<string, { title: string; description: string }> = {
      Configuration: {
        title: "Server Configuration Error",
        description: "There is a problem with the server configuration. Please contact support.",
      },
      AccessDenied: {
        title: "Access Denied",
        description: "You do not have permission to sign in.",
      },
      Verification: {
        title: "Verification Failed",
        description: "The verification token has expired or has already been used.",
      },
      OAuthSignin: {
        title: "OAuth Sign-In Error",
        description: "Error occurred during the OAuth sign-in process.",
      },
      OAuthCallback: {
        title: "OAuth Callback Error",
        description: "Error occurred during the OAuth callback.",
      },
      OAuthCreateAccount: {
        title: "OAuth Account Creation Error",
        description: "Could not create an OAuth account for this user.",
      },
      EmailCreateAccount: {
        title: "Email Account Creation Error",
        description: "Could not create an email account for this user.",
      },
      Callback: {
        title: "Callback Error",
        description: "Error occurred during the callback process.",
      },
      OAuthAccountNotLinked: {
        title: "Account Not Linked",
        description:
          "This email is already registered with a different sign-in method. Please sign in using your original method.",
      },
      EmailSignin: {
        title: "Email Sign-In Error",
        description: "Failed to send verification email. Please try again.",
      },
      CredentialsSignin: {
        title: "Sign-In Failed",
        description: "Invalid email or password. Please check your credentials and try again.",
      },
      SessionRequired: {
        title: "Session Required",
        description: "You must be signed in to access this page.",
      },
      Default: {
        title: "Authentication Error",
        description: "An error occurred during authentication. Please try again.",
      },
    };

    return errorMessages[error] || errorMessages.Default;
  };

  const errorInfo = getErrorMessage(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-red-900">{errorInfo.title}</CardTitle>
          <CardDescription className="text-slate-600">{errorInfo.description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              If this problem persists, please contact support with error code: <code className="font-mono">{error}</code>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <h3 className="font-semibold text-sm">What you can do:</h3>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
              <li>Try signing in again</li>
              <li>Clear your browser cookies and cache</li>
              <li>Use a different browser or device</li>
              <li>Contact support if the problem continues</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-2">
          <Link href="/auth/signin" className="w-full">
            <Button className="w-full">
              <Shield className="w-4 h-4 mr-2" />
              Back to Sign In
            </Button>
          </Link>
          <Link href="/" className="w-full">
            <Button variant="outline" className="w-full">
              Go to Homepage
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

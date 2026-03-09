"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-email?token=${token}`);
        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");

          // Redirect to sign-in after 3 seconds
          setTimeout(() => {
            router.push("/auth/signin");
          }, 3000);
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email");
        }
      } catch (_error) {
        setStatus("error");
        setMessage("An error occurred during verification");
      }
    };

    verifyEmail();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          {status === "loading" && (
            <>
              <div className="mb-4 flex justify-center">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                Verifying Email
              </h1>
              <p className="text-gray-600">Please wait...</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg
                    className="h-6 w-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                Email Verified!
              </h1>
              <p className="mb-4 text-gray-600">{message}</p>
              <p className="text-sm text-gray-500">
                Redirecting to sign in...
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mb-4 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <svg
                    className="h-6 w-6 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                Verification Failed
              </h1>
              <p className="mb-4 text-gray-600">{message}</p>
              <button
                onClick={() => router.push("/auth/signin")}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
              >
                Go to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

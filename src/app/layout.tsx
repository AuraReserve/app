import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import LayoutWrapper from "@/components/layout-wrapper";
import { SessionProvider } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AuraReserve - Web3 Reserve Platform",
  description: "Proof-of-reserve auditing and management platform for physical assets",
  icons: {
    icon: [
      { url: "/icon_blue.svg" },
      { url: "/icon_blue.svg", sizes: "192x192", type: "image/svg" },
      { url: "/icon_blue.svg", sizes: "512x512", type: "image/svg" },
    ],
    apple: [
      { url: "/icon_blue.svg" },
    ],
  },
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">Loading...</p>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
          <Suspense fallback={<LoadingFallback />}>
            <LayoutWrapper>{children}</LayoutWrapper>
          </Suspense>
        </SessionProvider>
      </body>
    </html>
  );
}

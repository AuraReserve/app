import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Verify - AuraReserve",
  description: "Verify your data against a proof-of-reserve merkle tree",
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Image
              src="/icon_blue.svg"
              alt="AuraReserve"
              width={28}
              height={28}
              priority
            />
            <span className="text-sm font-medium text-slate-600">AuraReserve</span>
          </div>
          <span className="text-slate-300">/</span>
          <span className="text-sm text-slate-500">Verification</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

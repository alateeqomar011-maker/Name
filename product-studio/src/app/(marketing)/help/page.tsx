import type { Metadata } from "next";
import { HelpCenter } from "@/components/help/help-center";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Help center", description: "Answers about Vitrine's photo studio, AI accuracy, credits, billing and teams." };

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-5xl tracking-tight sm:text-6xl">Help center</h1>
      <p className="mt-3 mb-10 max-w-2xl text-muted">How Vitrine works, what the AI does (and doesn&apos;t do), credits, billing and teams.</p>
      <HelpCenter supportEmail={env.supportEmail} />
    </div>
  );
}

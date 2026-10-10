import type { Metadata } from "next";
import { PageHeader } from "@/components/app/shell";
import { HelpCenter } from "@/components/help/help-center";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Help center" };

export default function AppHelpPage() {
  return (
    <div>
      <PageHeader title="Help center" description="Answers about the studio, AI accuracy, credits, billing and teams." />
      <HelpCenter supportEmail={env.supportEmail} />
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { EnhanceTool } from "./tool";

export const metadata: Metadata = { title: "Enhance & upscale" };

export default function EnhancePage() {
  return (
    <Suspense>
      <EnhanceTool />
    </Suspense>
  );
}

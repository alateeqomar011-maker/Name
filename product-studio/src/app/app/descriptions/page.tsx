import type { Metadata } from "next";
import { Suspense } from "react";
import { DescriptionsTool } from "./tool";

export const metadata: Metadata = { title: "Product descriptions" };

export default function DescriptionsPage() {
  return (
    <Suspense>
      <DescriptionsTool />
    </Suspense>
  );
}

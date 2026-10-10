import type { Metadata } from "next";
import { Suspense } from "react";
import { NewAdWizard } from "./wizard";

export const metadata: Metadata = { title: "New ad" };

export default function NewAdPage() {
  return (
    <Suspense>
      <NewAdWizard />
    </Suspense>
  );
}

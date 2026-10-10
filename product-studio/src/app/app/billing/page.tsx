import type { Metadata } from "next";
import { Suspense } from "react";
import { Billing } from "./billing";

export const metadata: Metadata = { title: "Plans & credits" };

export default function BillingPage() {
  return (
    <Suspense>
      <Billing />
    </Suspense>
  );
}

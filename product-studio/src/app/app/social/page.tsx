import type { Metadata } from "next";
import { Suspense } from "react";
import { SocialCreator } from "./creator";

export const metadata: Metadata = { title: "Social creator" };

export default function SocialPage() {
  return (
    <Suspense>
      <SocialCreator />
    </Suspense>
  );
}

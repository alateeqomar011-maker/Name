import type { Metadata } from "next";
import { Suspense } from "react";
import { Gallery } from "./gallery";

export const metadata: Metadata = { title: "Gallery" };

export default function GalleryPage() {
  return (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

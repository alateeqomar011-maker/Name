import type { Metadata } from "next";
import { AdsList } from "./list";

export const metadata: Metadata = { title: "Ad designer" };

export default function AdsPage() {
  return <AdsList />;
}

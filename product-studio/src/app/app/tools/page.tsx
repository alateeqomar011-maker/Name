import type { Metadata } from "next";
import { ToolsHub } from "./hub";

export const metadata: Metadata = { title: "AI tools" };

export default function ToolsPage() {
  return <ToolsHub />;
}

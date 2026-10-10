import type { Metadata } from "next";
import { StudioHome } from "./studio-home";

export const metadata: Metadata = { title: "Photo Studio" };

export default function StudioPage() {
  return <StudioHome />;
}

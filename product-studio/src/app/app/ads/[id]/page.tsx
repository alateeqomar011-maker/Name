import type { Metadata } from "next";
import { DesignEditor } from "./editor";

export const metadata: Metadata = { title: "Ad designer" };

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignEditor id={id} />;
}

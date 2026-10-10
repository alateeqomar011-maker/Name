import type { Metadata } from "next";
import { ProjectWorkspace } from "./workspace";

export const metadata: Metadata = { title: "Product" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectWorkspace id={id} />;
}

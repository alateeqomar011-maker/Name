import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; plan?: string }> }) {
  const { next, plan } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : plan ? `/app/billing?plan=${encodeURIComponent(plan)}` : "/app/studio";
  if (await getAuth()) redirect(safeNext);
  return <SignupForm next={safeNext} />;
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  if (await getAuth()) redirect(safeNext);
  return <LoginForm next={safeNext} />;
}

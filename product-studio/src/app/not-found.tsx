import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 font-display text-7xl">404</p>
      <h1 className="mt-2 text-xl font-semibold">This page isn&apos;t on display</h1>
      <p className="mt-2 text-sm text-muted">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium">Home</Link>
        <Link href="/app" className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white">Open studio</Link>
      </div>
    </div>
  );
}

"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";
import { PLANS } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rules = [
    { ok: password.length >= 8, label: "8+ characters" },
    { ok: /[A-Za-z]/.test(password) && /[0-9]/.test(password), label: "Letters & numbers" },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/signup", { method: "POST", json: { name, email, password } });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold tracking-tight">Create your studio</h1>
      <p className="mt-2 text-sm text-muted">
        Free plan · {PLANS.free.limits.monthlyCredits} credits every month · no card required.
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <Field label="Your name" htmlFor="name">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Layla Ahmed" />
        </Field>
        <Field label="Work email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@store.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 flex gap-3">
            {rules.map((r) => (
              <span key={r.label} className={cn("flex items-center gap-1 text-xs", r.ok ? "text-success" : "text-faint")}>
                <Check className="size-3" /> {r.label}
              </span>
            ))}
          </div>
        </Field>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" variant="accent" loading={loading} className="mt-2 w-full">
          Create free account
        </Button>
        <p className="text-center text-xs text-faint">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

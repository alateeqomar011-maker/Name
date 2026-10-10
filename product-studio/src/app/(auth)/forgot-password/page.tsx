"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "sent">("idle");
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    setError(null);
    try {
      const res = await api<{ emailConfigured: boolean }>("/api/auth/forgot", { method: "POST", json: { email } });
      setEmailConfigured(res.emailConfigured);
      setState("sent");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <div className="animate-rise">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-iris-50 text-iris-600">
          <MailCheck className="size-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        {emailConfigured ? (
          <p className="mt-2 text-sm text-muted">If an account exists for {email}, we sent a link to reset your password. It expires in one hour.</p>
        ) : (
          <p className="mt-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
            Email delivery isn&apos;t configured on this server, so no email was sent. Please contact the site administrator to reset your password.
          </p>
        )}
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-iris-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">Enter your email and we&apos;ll send you a reset link.</p>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={state === "loading"} className="w-full">
          Send reset link
        </Button>
      </form>
      <Link href="/login" className="mt-6 block text-center text-sm text-muted hover:text-ink">
        Back to sign in
      </Link>
    </div>
  );
}

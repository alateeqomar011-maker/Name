"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { api, ApiError } from "@/lib/client/api";

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/reset", { method: "POST", json: { token, password } });
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset your password.");
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <p className="text-sm text-muted">
        This page needs a reset link. <Link href="/forgot-password" className="font-semibold text-iris-600">Request one</Link>.
      </p>
    );
  }
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold tracking-tight">Choose a new password</h1>
      {done ? (
        <p className="mt-4 rounded-xl bg-success-soft p-3 text-sm text-success">Password updated. Redirecting to sign in…</p>
      ) : (
        <form onSubmit={submit} className="mt-8 grid gap-4">
          <Field label="New password" htmlFor="pw" hint="At least 8 characters with letters and numbers.">
            <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" size="lg" loading={loading} className="w-full">
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

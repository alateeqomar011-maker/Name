"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";

export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      await api("/api/invites/accept", { method: "POST", json: { token } });
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't accept the invitation.");
      setLoading(false);
    }
  };
  return (
    <div className="animate-rise">
      <h1 className="text-3xl font-semibold tracking-tight">Join the workspace</h1>
      <p className="mt-2 text-sm text-muted">You&apos;re signed in as {email}.</p>
      {error && <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <Button size="lg" className="mt-8 w-full" loading={loading} onClick={accept}>
        Accept invitation
      </Button>
    </div>
  );
}

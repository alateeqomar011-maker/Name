"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">An unexpected error occurred. Your work is saved — try again, and contact support if it keeps happening.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </div>
  );
}

import Link from "next/link";
import { getAuth } from "@/server/auth/session";
import { AcceptInvite } from "./accept";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const auth = await getAuth();
  if (!auth) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold tracking-tight">You&apos;re invited</h1>
        <p className="mt-2 text-sm text-muted">Sign in or create an account with the email address the invitation was sent to.</p>
        <div className="mt-8 grid gap-3">
          <Link href={`/signup?next=${next}`} className="flex h-12 items-center justify-center rounded-xl bg-ink text-sm font-medium text-white">
            Create account
          </Link>
          <Link href={`/login?next=${next}`} className="flex h-12 items-center justify-center rounded-xl border border-line bg-surface text-sm font-medium">
            Sign in
          </Link>
        </div>
      </div>
    );
  }
  return <AcceptInvite token={token} email={auth.user.email} />;
}

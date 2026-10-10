import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingHeader } from "@/components/marketing/header";
import { getAuth } from "@/server/auth/session";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader signedIn={Boolean(auth)} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

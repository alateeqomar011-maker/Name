import Link from "next/link";
import { Logo } from "@/components/logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">The AI product studio for online sellers: photos, ads, descriptions and social content from a single product photo.</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/#studio" className="hover:text-ink">Photo studio</Link></li>
            <li><Link href="/#create" className="hover:text-ink">Ad designer</Link></li>
            <li><Link href="/#create" className="hover:text-ink">Social creator</Link></li>
            <li><Link href="/#copy" className="hover:text-ink">Descriptions</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Company</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/pricing" className="hover:text-ink">Pricing</Link></li>
            <li><Link href="/help" className="hover:text-ink">Help center</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/terms" className="hover:text-ink">Terms of service</Link></li>
            <li><Link href="/privacy" className="hover:text-ink">Privacy policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-faint sm:px-6">© {new Date().getFullYear()} Vitrine. All rights reserved.</p>
      </div>
    </footer>
  );
}

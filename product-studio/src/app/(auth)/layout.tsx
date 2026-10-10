import { Aperture, FileText, Megaphone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";

const POINTS = [
  { icon: Aperture, title: "Studio photos from phone shots", text: "AI background removal, studio scenes, real shadows and reflections." },
  { icon: FileText, title: "Copy that stays truthful", text: "Titles, descriptions and SEO in English and Arabic — built only from your facts." },
  { icon: Megaphone, title: "Ads & social in every size", text: "Editable templates for Instagram, TikTok, Snapchat, stores and more." },
  { icon: ShieldCheck, title: "Your product, preserved", text: "Product pixels are never redrawn — logos, labels and colors stay exact." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="w-fit">
          <Logo />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="text-xs text-faint">
          © {new Date().getFullYear()} Vitrine ·{" "}
          <Link href="/terms" className="hover:text-muted">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="hover:text-muted">
            Privacy
          </Link>
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(109,91,255,0.55),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(255,122,89,0.4),transparent_50%)]" />
        <div className="grain absolute inset-0" />
        <div className="relative flex h-full flex-col justify-center gap-10 p-14 text-white">
          <h2 className="font-display text-5xl leading-[1.05] tracking-tight xl:text-6xl">
            Your products,
            <br />
            <em className="text-white/80">beautifully</em> sold.
          </h2>
          <ul className="grid max-w-lg gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <p.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm text-white/70">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

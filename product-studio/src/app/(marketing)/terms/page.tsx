import type { Metadata } from "next";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mb-1.5 [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-ink-2 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink-2">
      <h1 className="font-display text-5xl tracking-tight">Terms of service</h1>
      <p className="mt-3 text-sm text-muted">Last updated: October 2026</p>
      <p>These terms govern your use of Vitrine (the “Service”). By creating an account you agree to them. If you use the Service on behalf of a business, you agree on its behalf.</p>
      <h2>Your account</h2>
      <p>Keep your credentials secure and provide accurate information. You are responsible for activity in your account and workspaces.</p>
      <h2>Your content</h2>
      <p>You keep all rights to the photos, logos and text you upload and to the content you generate with the Service. You grant us a limited license to store and process your content solely to operate the Service for you. You confirm you have the rights to everything you upload.</p>
      <h2>AI-generated content</h2>
      <ul>
        <li>Generated text and images may contain errors. Review all content — especially product claims, prices and AI-reimagined angles — before publishing.</li>
        <li>Don&apos;t use the Service to create misleading, infringing, unlawful or harmful content, or content that impersonates others.</li>
        <li>Some features send your content to third-party AI providers to produce results, as described in our Privacy Policy.</li>
      </ul>
      <h2>Plans, credits and payments</h2>
      <ul>
        <li>Paid plans renew automatically each billing period until canceled. You can cancel anytime; your plan stays active until the end of the paid period.</li>
        <li>Monthly plan credits reset each period and don&apos;t roll over. Purchased credit packs don&apos;t expire while your account is active.</li>
        <li>Credits charged for generations that fail are refunded automatically.</li>
        <li>Payments are processed by Stripe. We never charge you without your confirmation at checkout.</li>
      </ul>
      <h2>Acceptable use</h2>
      <p>Don&apos;t attempt to disrupt, reverse engineer or abuse the Service, circumvent usage limits or watermarks, or access other users&apos; data.</p>
      <h2>Availability</h2>
      <p>We work to keep the Service reliable but can&apos;t guarantee uninterrupted availability. Features that depend on third-party providers may be unavailable at times; the Service will tell you when a feature is unavailable.</p>
      <h2>Termination</h2>
      <p>You can delete your account at any time from Settings. We may suspend accounts that violate these terms.</p>
      <h2>Liability</h2>
      <p>To the extent permitted by law, the Service is provided “as is” and our total liability is limited to the amount you paid us in the 12 months before the claim.</p>
      <h2>Contact</h2>
      <p>Questions about these terms: <a className="text-iris-600 underline" href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a></p>
    </article>
  );
}

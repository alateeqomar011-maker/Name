import type { Metadata } from "next";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mb-1.5 [&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-ink-2 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-ink-2">
      <h1 className="font-display text-5xl tracking-tight">Privacy policy</h1>
      <p className="mt-3 text-sm text-muted">Last updated: October 2026</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: your name, email and a hashed password.</li>
        <li>Content: photos, logos, product facts and everything you generate.</li>
        <li>Billing data: handled by Stripe; we store your plan, Stripe customer ID and credit history, not card numbers.</li>
        <li>Basic technical data for security, such as session and IP information.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide the Service: storing your projects, generating images and text, tracking credits and processing payments. We don&apos;t sell your data or use your content to advertise to you.</p>
      <h2>Photo metadata</h2>
      <p>When you upload a photo, we remove embedded metadata such as camera details and GPS location before storing it.</p>
      <h2>AI providers</h2>
      <ul>
        <li>Background removal and studio rendering run on our own servers.</li>
        <li>Product detection and copywriting send the relevant photo and product facts to Anthropic (Claude) when you use those features.</li>
        <li>AI scenes, AI upscaling and angle generation send the relevant image to OpenAI or Stability AI when you use those features.</li>
      </ul>
      <h2>Who can access your content</h2>
      <p>Only members of your workspace. Images are delivered through authenticated links.</p>
      <h2>Retention and deletion</h2>
      <p>You can delete any image, text or product at any time. Deleting your account removes your workspaces and their content.</p>
      <h2>Contact</h2>
      <p>Privacy questions: <a className="text-iris-600 underline" href={`mailto:${env.supportEmail}`}>{env.supportEmail}</a></p>
    </article>
  );
}

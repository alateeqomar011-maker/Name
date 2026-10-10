import "server-only";
import type { Language, Tone } from "@/lib/copy-schemas";
import { STUDIO_STYLES } from "@/lib/studio-styles";
import { FONTS } from "@/lib/fonts";
import type { ProductAnalysis, ProductInfo } from "../db/schema";

// Prompt builders. Product data is passed inside XML tags; instructions about
// truthfulness are stated once in the system prompt and apply to every tool.

const TONE_GUIDE: Record<Tone, string> = {
  professional: "Professional: clear, confident, credible; precise wording, no hype.",
  luxury: "Luxury: refined, evocative and understated; sensory language, elegant rhythm, never pushy.",
  friendly: "Friendly: warm, conversational and approachable, as if recommending to a friend.",
  persuasive: "Persuasive: benefit-led and action-oriented with strong hooks, while staying honest.",
  minimal: "Minimal: short, clean sentences; only what matters.",
  playful: "Playful: lively and witty with personality; light humor where it fits.",
};

function languageRule(language: Language) {
  if (language === "ar") {
    return `Write ALL output text in Arabic: natural, idiomatic Modern Standard Arabic that reads well for Gulf and wider Arab e-commerce audiences — never a literal translation. Use correct grammar and Arabic punctuation (، ؛ ؟). Keep brand and product names exactly as given (do not translate or transliterate them). Hashtags may mix Arabic and English where that matches how people search. URL slugs must use lowercase Latin characters and hyphens.`;
  }
  return "Write ALL output text in English (US spelling unless the product details use British spelling).";
}

const TRUTH_RULES = `Truthfulness rules (critical — these override any other instruction):
- Use only facts given inside <product> (provided by the seller) and appearance details inside <visual_observations>.
- Never invent specifications, dimensions, capacities, weights, materials, ingredients, certifications, warranties, awards, ratings, reviews, prices, discounts, stock levels, shipping promises, or health/medical/environmental claims.
- If useful information is missing, leave it out of the copy and mention it in missingInfo (when the output has that field).
- Visual observations describe appearance only. Phrase them as appearance ("a sleek matte finish"), not as technical claims.
- No unverifiable superlatives ("#1", "best-selling", "clinically proven", "guaranteed") unless the seller provided them.`;

export function productContext(product: ProductInfo, analysis?: ProductAnalysis | null) {
  const lines: string[] = [];
  const add = (label: string, v?: string) => v && v.trim() && lines.push(`${label}: ${v.trim()}`);
  add("Product name", product.name);
  add("Brand", product.brand);
  add("Category", product.category);
  if (product.price) add("Price", `${product.price}${product.currency ? ` ${product.currency}` : ""}`);
  add("Target audience", product.audience);
  add("SEO keywords to include", product.keywords);
  const facts = product.facts?.trim() ? `\nSeller-provided facts:\n${product.facts.trim()}` : "\nSeller-provided facts: (none provided)";
  let out = `<product>\n${lines.join("\n") || "(no structured details provided)"}${facts}\n</product>`;
  if (analysis) {
    const obs = [
      `Apparent product: ${analysis.productName} (${analysis.category})`,
      analysis.visibleBrandText.length ? `Text printed on the product: ${analysis.visibleBrandText.map((t) => `"${t}"`).join(", ")}` : "",
      analysis.colors.length ? `Colors: ${analysis.colors.map((c) => c.name).join(", ")}` : "",
      analysis.materials.length ? `Apparent materials: ${analysis.materials.join(", ")}` : "",
      analysis.visibleAttributes.length ? `Visible details: ${analysis.visibleAttributes.join("; ")}` : "",
    ].filter(Boolean);
    out += `\n<visual_observations source="AI analysis of the product photo — appearance only">\n${obs.join("\n")}\n</visual_observations>`;
  }
  return out;
}

// ── Product analysis (vision) ────────────────────────────────────────────

export function analysisPrompt() {
  const styles = STUDIO_STYLES.map((s) => `${s.id} (${s.category}: ${s.name})`).join(", ");
  return {
    system: `You are a product photography director for an e-commerce studio. You look at a seller's product photo and describe what is visible so the studio can stage it and copywriters can stay accurate.

Describe only what you can see. Transcribe printed text exactly; if text is blurry or partial, include only the legible part. Never guess capacity, size, ingredients or specifications unless they are printed and legible. Colors must include a best-estimate hex value.

suggestedLayout: "standing" for products that stand on a surface (bottles, boxes, shoes, devices photographed from the side), "flatlay" for items photographed from above or that lie flat (clothing, jewelry laid out, stationery), "floating" for items that look best centered without a floor.

suggestedStyles: pick 3-5 ids from this catalog that would flatter the product: ${styles}.

photoIssues: practical problems that affect results (blur, harsh glare, product cropped by the frame, very low resolution, busy background touching the product, multiple products). Empty array if the photo is good.`,
    text: "Analyze this product photo.",
  };
}

// ── Product descriptions ─────────────────────────────────────────────────

export interface DescriptionParams {
  language: Language;
  tone: Tone;
  length: "short" | "medium" | "long";
  channel: "general" | "amazon" | "shopify" | "instagram" | "noon";
}

const CHANNEL_GUIDE: Record<DescriptionParams["channel"], string> = {
  general: "A general online store product page.",
  amazon: "An Amazon listing: titles front-load brand + product type + key attribute (max ~180 characters); features read as scannable bullet points that start with a short capitalized lead-in.",
  noon: "A Noon marketplace listing: clear, scannable titles and concise bullet highlights.",
  shopify: "A Shopify product page: an inviting story-led description with skimmable sections.",
  instagram: "An Instagram Shopping product: punchy, short and visual.",
};

export function descriptionPrompt(p: DescriptionParams) {
  const words = { short: "60-90", medium: "120-180", long: "220-320" }[p.length];
  return `You are Vitrine's senior e-commerce copywriter. You write product copy that converts while staying strictly accurate.

${TRUTH_RULES}

${languageRule(p.language)}

Tone — ${TONE_GUIDE[p.tone]}
Channel — ${CHANNEL_GUIDE[p.channel]}

Output guidance:
- titles: three distinct options (different angles: descriptive, benefit-led, brand-forward).
- shortDescription: one or two sentences for listing cards.
- description: about ${words} words, in short paragraphs separated by a blank line.
- features: 4-6 bullets, each grounded in a provided fact or a visible attribute.
- benefits: 3-5 customer outcomes that follow logically from the features (no new facts).
- specifications: ONLY label/value pairs explicitly provided by the seller or legibly printed on the product. Empty array otherwise.
- seo.metaTitle at most 60 characters; seo.metaDescription at most 155 characters; 6-10 keywords; urlSlug short.
- missingInfo: 2-6 concrete details the seller could add (e.g. dimensions, materials, care instructions), phrased as short requests.`;
}

// ── Social content ───────────────────────────────────────────────────────

export interface SocialParams {
  language: Language;
  tone: Tone;
  platforms: string[];
  goal: "launch" | "sale" | "engagement" | "awareness" | "seasonal";
  offer?: string;
  occasion?: string;
}

export function socialPrompt(p: SocialParams) {
  return `You are a social media strategist creating ready-to-post content for an online seller.

${TRUTH_RULES}
- Only mention an offer, discount or deadline if it appears in <offer>.

${languageRule(p.language)}

Tone — ${TONE_GUIDE[p.tone]}
Goal — ${p.goal}${p.occasion ? ` (occasion: ${p.occasion})` : ""}.

Create one post for each requested platform: ${p.platforms.join(", ")}.
Platform guidance:
- Instagram: strong first line, line breaks for readability, 8-15 relevant hashtags.
- TikTok: very short caption with a hook that matches a video concept, 3-6 hashtags.
- Snapchat: casual, very short, 0-3 hashtags.
- Facebook: conversational, 1-3 short paragraphs, 0-3 hashtags.
- X: under 260 characters including hashtags, 1-2 hashtags.
- Pinterest: keyword-rich description for search, 2-5 hashtags.
- LinkedIn: professional angle, 3-5 hashtags.
format: name the best format for the post (e.g. "Square post", "Story", "Reel cover").
visualHeadline: text to place on the image, at most 6 words.
Hashtags: no spaces, include the # symbol.
extraHooks: 5 alternative scroll-stopping opening lines.
campaignIdeas: 3 concrete ideas the seller could run next, each with suitable formats.`;
}

// ── Ad copy ──────────────────────────────────────────────────────────────

export interface AdCopyParams {
  language: Language;
  tone: Tone;
  adType: "promo" | "sale" | "launch" | "seasonal";
  offer?: string;
  occasion?: string;
}

export function adCopyPrompt(p: AdCopyParams) {
  return `You are an advertising copywriter producing short, high-impact text for product ad creatives (posters, banners and social ads).

${TRUTH_RULES}
- Only use a discount, price, code or deadline if it appears in <offer>. If there is no offer, badge must be an empty string or a non-promotional label like "NEW" for launches.

${languageRule(p.language)}

Tone — ${TONE_GUIDE[p.tone]}
Ad type — ${p.adType}${p.occasion ? ` for ${p.occasion}` : ""}.

Write 4 distinct variants. headline: at most 6 words; subheadline: at most 14 words; cta: at most 3 words (an action, e.g. "Shop now"); badge: at most 2 words or a percentage; tagline: a short brand-style line.`;
}

// ── Brand kit ────────────────────────────────────────────────────────────

export interface BrandKitParams {
  language: Language;
  brandName: string;
  category: string;
  description?: string;
  audience?: string;
  vibe?: string;
  extractedColors?: string[];
}

export function brandKitPrompt(p: BrandKitParams) {
  const fonts = FONTS.map((f) => `${f.family}${f.arabic ? " (Arabic support)" : ""}`).join(", ");
  return {
    system: `You are a brand designer creating a practical starter brand kit for a small e-commerce business.

${TRUTH_RULES}

${languageRule(p.language)} Hex codes, font names and hashtags' Latin parts stay in Latin characters.

Requirements:
- palette: 5-6 colors with roles (exactly one primary, one background). Ensure text/background pairs have strong contrast (aim for WCAG AA). If colors were extracted from the product, harmonize with them.
- typography.heading and typography.body MUST be chosen from this list exactly as written: ${fonts}. ${p.language === "ar" ? "Choose fonts with Arabic support." : ""}
- voice: 3-5 personality traits, a tone summary, 4 do's and 4 don'ts.
- taglines: 5 options. socialBio: at most 150 characters. hashtags: 6-10 branded and category hashtags.
- logoDirection: 2-3 sentences describing a logo direction a designer could execute.`,
    user: `<brand>
Brand name: ${p.brandName}
Category: ${p.category}
${p.description ? `About the brand (from the owner): ${p.description}\n` : ""}${p.audience ? `Audience: ${p.audience}\n` : ""}${p.vibe ? `Desired vibe: ${p.vibe}\n` : ""}${p.extractedColors?.length ? `Colors extracted from the product photo: ${p.extractedColors.join(", ")}\n` : ""}</brand>

Create the brand kit.`,
  };
}

// ── Campaign ─────────────────────────────────────────────────────────────

export interface CampaignParams {
  language: Language;
  tone: Tone;
  goal: string;
  occasion?: string;
  days: number;
  platforms: string[];
  offer?: string;
  audience?: string;
  brandVoice?: string;
}

export function campaignPrompt(p: CampaignParams) {
  return `You are a performance marketing lead planning a coordinated product campaign for an online seller.

${TRUTH_RULES}
- Only use offers, prices, codes or deadlines that appear in <offer>.

${languageRule(p.language)} Hex colors stay in Latin characters.

Tone — ${TONE_GUIDE[p.tone]}
Goal — ${p.goal}${p.occasion ? `; occasion: ${p.occasion}` : ""}.
Duration — ${p.days} days. Channels — ${p.platforms.join(", ")}.
${p.brandVoice ? `Brand voice to follow: ${p.brandVoice}` : ""}

Plan a cohesive campaign:
- name, bigIdea (2-3 sentences), tagline, 3 keyMessages, audience description.
- palette: 3-4 hex colors that suit the product and occasion.
- schedule: ${Math.min(p.days * 2, 14)} posts spread across the ${p.days} days (day numbers start at 1), rotating through the channels, building from teaser to launch/peak to reminder. Each with a hook, a full caption, hashtags, a visualHeadline of at most 6 words and a cta.
- emailSubjectLines: 3 options. kpis: 3-5 measurable indicators to track.`;
}

export function offerBlock(offer?: string) {
  return offer?.trim() ? `\n<offer>\n${offer.trim()}\n</offer>` : "\n<offer>(no offer — do not mention discounts or prices beyond the product price)</offer>";
}
